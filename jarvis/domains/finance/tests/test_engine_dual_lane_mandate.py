import copy
import unittest

from jarvis.domains.finance import engine


class AllocationEngineDualLaneMandateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
        self.state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)

    def test_current_weekly_result_prepares_crypto_and_stock_fund_etf_lanes(self) -> None:
        # Pinned against portfolio_state.json as of 2026-06-22.
        # Weekly budget: €115.38 (€500/month). BTC and quality_etf amounts
        # reflect the 40%/60% crypto/ETF split of the weekly budget under
        # current gaps and crypto risk rules.
        result = engine.allocate_weekly_budget(self.constitution, self.state)
        ticket = result["approval_ticket"]
        mandate = ticket["weekly_dual_lane_mandate"]

        self.assertEqual(mandate["mandate"], engine.WEEKLY_DUAL_LANE_MANDATE)
        self.assertEqual(ticket["executable_allocation"]["btc"], 46.15)
        self.assertEqual(ticket["executable_allocation"]["quality_etf"], 69.23)
        self.assertEqual(mandate["crypto_lane"]["status"], "READY_FOR_MANUAL_BUY")
        self.assertEqual(mandate["crypto_lane"]["asset"], "btc")
        self.assertEqual(mandate["crypto_lane"]["amount"], 46.15)
        self.assertEqual(mandate["stock_fund_etf_lane"]["status"], "READY_FOR_MANUAL_BUY")
        self.assertEqual(mandate["stock_fund_etf_lane"]["asset"], "quality_etf")
        self.assertEqual(mandate["stock_fund_etf_lane"]["amount"], 69.23)
        self.assertFalse(ticket["trades_executed"])
        self.assertIn("No broker connection.", ticket["safety_checks"])

    def test_phase_one_crypto_lane_prioritizes_btc_while_hype_is_locked(self) -> None:
        state = copy.deepcopy(self.state)
        state["holdings"]["btc"] = 1600.0
        state["holdings"]["hype"] = 0.0
        state["legacy_holdings"] = {
            "lhv_growth_cash_pending_settlement": 0.0,
            "lhv_growth_euro_bond": 0.0,
            "lhv_growth_iemm": 0.0,
            "lhv_growth_sxr8": 8000.0,
            "lhv_growth_world_equities": 0.0,
            "lhv_growth_xcha": 0.0,
        }
        result = engine.allocate_weekly_budget(self.constitution, state)
        mandate = result["approval_ticket"]["weekly_dual_lane_mandate"]

        self.assertEqual(self.constitution["crypto_universe"]["btc"]["phase_unlock"], 1)
        self.assertEqual(self.constitution["crypto_universe"]["hype"]["phase_unlock"], 2)
        self.assertEqual(mandate["crypto_lane"]["status"], "READY_FOR_MANUAL_BUY")
        self.assertEqual(mandate["crypto_lane"]["asset"], "btc")
        self.assertGreater(mandate["crypto_lane"]["amount"], 0)
        self.assertGreater(result["executable_allocations_cents"].get("btc", 0), 0)
        self.assertEqual(result["executable_allocations_cents"].get("hype"), 0)

    def test_crypto_lane_defers_when_all_crypto_risk_room_is_exhausted(self) -> None:
        state = copy.deepcopy(self.state)
        state["holdings"]["btc"] = 520.0
        state["holdings"]["hype"] = 90.0
        state["holdings"]["tao"] = 90.0
        state["legacy_holdings"] = {
            "lhv_growth_cash_pending_settlement": 0.0,
            "lhv_growth_euro_bond": 0.0,
            "lhv_growth_iemm": 500.0,
            "lhv_growth_sxr8": 500.0,
            "lhv_growth_world_equities": 0.0,
            "lhv_growth_xcha": 0.0,
        }
        result = engine.allocate_weekly_budget(self.constitution, state)
        mandate = result["approval_ticket"]["weekly_dual_lane_mandate"]

        self.assertEqual(mandate["crypto_lane"]["status"], "DEFERRED_BY_RISK_OR_NO_ELIGIBLE_CRYPTO")
        self.assertIsNone(mandate["crypto_lane"]["asset"])
        self.assertEqual(mandate["crypto_lane"]["amount"], 0.0)
        self.assertGreater(mandate["stock_fund_etf_lane"]["amount"], 0)

    def test_stock_fund_etf_lane_follows_dynamic_etf_scoring_not_static_quality(self) -> None:
        holdings = engine.investable_holdings(self.constitution, self.state)
        etf_scores = {
            "global_core_etf": {"enabled": True, "final_score": 50.0},
            "growth_nasdaq_etf": {"enabled": True, "final_score": 99.0},
            "quality_etf": {"enabled": True, "final_score": 10.0},
        }
        allocations = engine.calculate_ideal_allocations(
            self.constitution, holdings, engine.cents(103.85), etf_scores
        )

        self.assertGreater(allocations["btc"], 0)
        self.assertGreater(allocations["growth_nasdaq_etf"], 0)
        self.assertEqual(allocations["quality_etf"], 0)

    def test_dual_lane_mandate_is_manual_only_and_never_execution(self) -> None:
        result = engine.allocate_weekly_budget(self.constitution, self.state)
        mandate = result["approval_ticket"]["weekly_dual_lane_mandate"]

        self.assertTrue(mandate["manual_action_required"])
        self.assertFalse(mandate["trades_executed"])
        self.assertEqual(result["approval_ticket"]["approval_status"], "pending_manual_approval")
        self.assertFalse(result["approval_ticket"]["trades_executed"])


if __name__ == "__main__":
    unittest.main()
