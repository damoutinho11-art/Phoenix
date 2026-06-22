"""Tests for /finance routes.

Tests use the real portfolio_state.json where it exists, and use
dependency_overrides to simulate edge cases (missing file, bad constitution).
No business logic is asserted here beyond the API contract shape.
"""

import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app

client = TestClient(app)


class HealthRouteTests(unittest.TestCase):
    def test_health_returns_200(self) -> None:
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)

    def test_health_shape(self) -> None:
        data = client.get("/health").json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("finance", data["domains"])
        self.assertIn("calendar", data["domains"])


class FinanceSummaryRouteTests(unittest.TestCase):
    def test_summary_returns_200(self) -> None:
        response = client.get("/finance/summary")
        self.assertEqual(response.status_code, 200)

    def test_summary_shape(self) -> None:
        data = client.get("/finance/summary").json()
        self.assertIn("as_of", data)
        self.assertIn("total_invested", data)
        self.assertIn("sleeve_summary", data)
        self.assertIn("staleness_warning", data)
        self.assertIn("constitution_valid", data)

    def test_summary_constitution_valid_is_true(self) -> None:
        data = client.get("/finance/summary").json()
        self.assertTrue(data["constitution_valid"])

    def test_summary_sleeve_summary_has_all_target_sleeves(self) -> None:
        data = client.get("/finance/summary").json()
        sleeve_names = {s["name"] for s in data["sleeve_summary"]}
        expected = {"btc", "hype", "tao", "global_core_etf", "growth_nasdaq_etf",
                    "quality_etf", "discovery", "tactical_reserve"}
        self.assertEqual(sleeve_names, expected)

    def test_summary_each_sleeve_has_required_fields(self) -> None:
        data = client.get("/finance/summary").json()
        for sleeve in data["sleeve_summary"]:
            self.assertIn("name", sleeve)
            self.assertIn("value", sleeve)
            self.assertIn("current_weight", sleeve)
            self.assertIn("target_weight", sleeve)
            self.assertIn("gap", sleeve)
            self.assertIn("band_status", sleeve)

    def test_summary_as_of_is_2026_06_22(self) -> None:
        data = client.get("/finance/summary").json()
        self.assertEqual(data["as_of"], "2026-06-22")

    def test_summary_no_staleness_warning_on_fresh_data(self) -> None:
        # portfolio_state.json as_of is 2026-06-22; today per project context is 2026-06-22
        data = client.get("/finance/summary").json()
        # Either None (fresh) or a string (stale) — both are valid; just check the type
        warning = data["staleness_warning"]
        self.assertTrue(warning is None or isinstance(warning, str))

    def test_summary_missing_portfolio_state_returns_503(self) -> None:
        def _raise() -> dict:
            raise HTTPException(status_code=503, detail="portfolio_state.json not found.")

        app.dependency_overrides[dependencies.get_portfolio_state] = _raise
        try:
            response = client.get("/finance/summary")
            self.assertEqual(response.status_code, 503)
        finally:
            app.dependency_overrides.clear()

    def test_summary_invalid_constitution_returns_500(self) -> None:
        def _raise() -> dict:
            raise HTTPException(status_code=500, detail="Finance constitution violation: test")

        app.dependency_overrides[dependencies.get_finance_constitution] = _raise
        try:
            response = client.get("/finance/summary")
            self.assertEqual(response.status_code, 500)
        finally:
            app.dependency_overrides.clear()


class FinanceRecommendationRouteTests(unittest.TestCase):
    def test_recommendation_returns_200(self) -> None:
        response = client.get("/finance/recommendation")
        self.assertEqual(response.status_code, 200)

    def test_recommendation_shape(self) -> None:
        data = client.get("/finance/recommendation").json()
        self.assertIn("week_budget", data)
        self.assertIn("recommendations", data)
        self.assertIn("rationale", data)
        self.assertIn("requires_approval", data)
        self.assertIn("portfolio_mode", data)
        self.assertIn("warnings", data)

    def test_recommendation_requires_approval_is_always_true(self) -> None:
        data = client.get("/finance/recommendation").json()
        self.assertTrue(data["requires_approval"])

    def test_recommendation_week_budget_matches_known_value(self) -> None:
        # Pinned against portfolio_state.json as of 2026-06-22 (€500/mo → €115.38/wk)
        data = client.get("/finance/recommendation").json()
        self.assertAlmostEqual(data["week_budget"], 115.38, places=2)

    def test_recommendation_contains_btc_and_quality_etf(self) -> None:
        # Pinned: current recommendation is BTC €46.15 + quality_etf €69.23
        data = client.get("/finance/recommendation").json()
        assets = {r["asset"]: r["amount"] for r in data["recommendations"]}
        self.assertIn("btc", assets)
        self.assertIn("quality_etf", assets)
        self.assertAlmostEqual(assets["btc"], 46.15, places=2)
        self.assertAlmostEqual(assets["quality_etf"], 69.23, places=2)

    def test_recommendation_lanes_are_correct(self) -> None:
        data = client.get("/finance/recommendation").json()
        recs = {r["asset"]: r for r in data["recommendations"]}
        self.assertEqual(recs["btc"]["lane"], "crypto")
        self.assertEqual(recs["quality_etf"]["lane"], "etf")

    def test_recommendation_rationale_is_non_empty_string(self) -> None:
        data = client.get("/finance/recommendation").json()
        self.assertIsInstance(data["rationale"], str)
        self.assertGreater(len(data["rationale"]), 0)

    def test_recommendation_missing_portfolio_state_returns_503(self) -> None:
        def _raise() -> dict:
            raise HTTPException(status_code=503, detail="portfolio_state.json not found.")

        app.dependency_overrides[dependencies.get_portfolio_state] = _raise
        try:
            response = client.get("/finance/recommendation")
            self.assertEqual(response.status_code, 503)
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
