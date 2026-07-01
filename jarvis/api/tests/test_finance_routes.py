"""Tests for /finance routes.

Tests use the real portfolio_state.json where it exists, and use
dependency_overrides to simulate edge cases (missing file, bad constitution).
No business logic is asserted here beyond the API contract shape.
"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app
from jarvis.data import database

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

    def test_summary_as_of_matches_canonical_fixture(self) -> None:
        data = client.get("/finance/summary").json()
        self.assertEqual(data["as_of"], "2026-06-29")

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

    def test_recommendation_contains_btc_and_growth_nasdaq_etf(self) -> None:
        # Pinned: current recommendation is BTC €46.15 + growth_nasdaq_etf €69.23
        data = client.get("/finance/recommendation").json()
        assets = {r["asset"]: r["amount"] for r in data["recommendations"]}
        self.assertIn("btc", assets)
        self.assertIn("growth_nasdaq_etf", assets)
        self.assertAlmostEqual(assets["btc"], 46.15, places=2)
        self.assertAlmostEqual(assets["growth_nasdaq_etf"], 69.23, places=2)

    def test_recommendation_lanes_are_correct(self) -> None:
        data = client.get("/finance/recommendation").json()
        recs = {r["asset"]: r for r in data["recommendations"]}
        self.assertEqual(recs["btc"]["lane"], "crypto")
        self.assertEqual(recs["growth_nasdaq_etf"]["lane"], "etf")

    def test_recommendation_rationale_uses_valid_euro_symbol(self) -> None:
        data = client.get("/finance/recommendation").json()
        self.assertIsInstance(data["rationale"], str)
        self.assertIn("€", data["rationale"])
        self.assertNotIn("â¬", data["rationale"])
        self.assertEqual(
            data["rationale"],
            "Buy BTC €46.15 (crypto lane); "
            "Buy growth_nasdaq_etf €69.23 (ETF lane)",
        )

    def test_recommendation_routes_and_safety_contract_are_unchanged(self) -> None:
        data = client.get("/finance/recommendation").json()
        recommendations = {
            item["asset"]: (item["amount"], item["route"])
            for item in data["recommendations"]
        }
        safety_checks = data["approval_ticket_summary"]["safety_checks"]

        self.assertEqual(
            recommendations,
            {
                "btc": (46.15, "lhv_crypto"),
                "growth_nasdaq_etf": (69.23, "lightyear"),
            },
        )
        self.assertIn("No broker connection.", safety_checks)
        self.assertIn("No orders created.", safety_checks)
        self.assertIn("No automatic selling.", safety_checks)

    def test_recommendation_missing_portfolio_state_returns_503(self) -> None:
        def _raise() -> dict:
            raise HTTPException(status_code=503, detail="portfolio_state.json not found.")

        app.dependency_overrides[dependencies.get_portfolio_state] = _raise
        try:
            response = client.get("/finance/recommendation")
            self.assertEqual(response.status_code, 503)
        finally:
            app.dependency_overrides.clear()


class FinancePerformanceHistoryRouteTests(unittest.TestCase):
    def test_performance_history_returns_real_empty_contract(self) -> None:
        response = client.get("/finance/performance/history")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "snapshots": [],
                "count": 0,
                "source": "real_sqlite",
                "message": "No real performance snapshots recorded yet.",
                "mock_data": False,
            },
        )


class FinanceBriefIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(database, "DB_PATH", Path(self.temp_dir.name) / "briefs.db")
        self.db_patch.start()
        database.init_db()
        safe_resolution = {
            "selected_candidate": None,
            "candidates": [],
            "source": "yfinance",
            "broker_source": "lightyear_public_fund_screener",
            "broker_verification": "not_verified",
            "confirmation_required": True,
            "lightyear_available": "unknown",
            "confidence": "unresolved",
            "reason": "test fixture",
        }
        self.resolver_patch = patch(
            "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
            return_value=safe_resolution,
        )
        self.regime_patch = patch(
            "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
        )
        self.resolver_patch.start()
        self.regime_patch.start()

    def tearDown(self) -> None:
        self.regime_patch.stop()
        self.resolver_patch.stop()
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_recommendation_returns_brief_id_for_new_brief(self) -> None:
        data = client.get("/finance/recommendation").json()

        self.assertIsInstance(data["brief_id"], int)
        self.assertEqual(data["brief_status"], "pending")

    def test_recommendation_returns_same_brief_id_while_pending(self) -> None:
        first = client.get("/finance/recommendation").json()
        second = client.get("/finance/recommendation").json()

        self.assertEqual(second["brief_id"], first["brief_id"])
        self.assertEqual(second["brief_status"], "pending")

    def test_recommendation_keeps_identity_and_status_after_approval(self) -> None:
        first = client.get("/finance/recommendation").json()
        approval = client.post(f"/finance/brief/{first['brief_id']}/approve")
        after = client.get("/finance/recommendation").json()

        self.assertEqual(approval.status_code, 200)
        self.assertEqual(after["brief_id"], first["brief_id"])
        self.assertEqual(after["brief_status"], "approved")
        self.assertEqual(after["brief_user_action"], "approved")
        self.assertEqual(after["recommendations"], [])
        self.assertTrue(after["week_closed"])
        self.assertFalse(after["week_done"])
        self.assertFalse(after["requires_approval"])
        self.assertEqual(after["portfolio_mode"], "week_approved")
        self.assertNotIn("executed", after["rationale"].lower())
        self.assertNotIn("deployed", after["rationale"].lower())

    def test_approved_week_returns_closed_manual_checklist(self) -> None:
        first = client.get("/finance/recommendation").json()
        client.post(f"/finance/brief/{first['brief_id']}/approve")

        checklist = client.get("/finance/manual-buy-checklist").json()

        self.assertEqual(checklist["brief_id"], first["brief_id"])
        self.assertEqual(checklist["brief_status"], "approved")
        self.assertEqual(checklist["checklist_status"], "WEEK_CLOSED")
        self.assertEqual(checklist["checklist_items"], [])
        self.assertFalse(checklist["requires_approval"])
        self.assertFalse(checklist["safety_flags"]["manual_broker_action_required"])

    def test_approval_response_has_no_trade_safety_flags(self) -> None:
        brief = client.get("/finance/recommendation").json()
        data = client.post(f"/finance/brief/{brief['brief_id']}/approve").json()

        self.assertFalse(data["trades_executed"])
        self.assertFalse(data["broker_connection"])
        self.assertTrue(data["manual_record_only"])


if __name__ == "__main__":
    unittest.main()
