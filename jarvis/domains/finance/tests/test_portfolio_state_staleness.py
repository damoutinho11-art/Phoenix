import copy
import unittest
from datetime import date

from jarvis.domains.finance import engine


class PortfolioStateStalenessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
        self.state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)

    def test_fresh_data_produces_no_staleness_warning(self) -> None:
        state = copy.deepcopy(self.state)
        state["as_of"] = "2026-06-15"
        warning = engine.portfolio_state_staleness_warning(state, today=date(2026, 6, 20))
        self.assertIsNone(warning)

    def test_data_at_exactly_the_threshold_is_not_flagged(self) -> None:
        state = copy.deepcopy(self.state)
        state["as_of"] = "2026-06-13"
        warning = engine.portfolio_state_staleness_warning(state, today=date(2026, 6, 20))
        self.assertIsNone(warning)

    def test_data_one_day_past_threshold_is_flagged(self) -> None:
        state = copy.deepcopy(self.state)
        state["as_of"] = "2026-06-12"
        warning = engine.portfolio_state_staleness_warning(state, today=date(2026, 6, 20))
        self.assertIsNotNone(warning)
        self.assertIn("8 days old", warning)

    def test_missing_as_of_is_flagged(self) -> None:
        state = copy.deepcopy(self.state)
        del state["as_of"]
        warning = engine.portfolio_state_staleness_warning(state, today=date(2026, 6, 20))
        self.assertIsNotNone(warning)
        self.assertIn("no as_of date", warning)

    def test_malformed_as_of_is_flagged(self) -> None:
        state = copy.deepcopy(self.state)
        state["as_of"] = "not-a-date"
        warning = engine.portfolio_state_staleness_warning(state, today=date(2026, 6, 20))
        self.assertIsNotNone(warning)
        self.assertIn("not a valid ISO date", warning)

    def test_future_as_of_is_flagged(self) -> None:
        state = copy.deepcopy(self.state)
        state["as_of"] = "2026-06-25"
        warning = engine.portfolio_state_staleness_warning(state, today=date(2026, 6, 20))
        self.assertIsNotNone(warning)
        self.assertIn("in the future", warning)

    def test_stale_data_warning_appears_first_in_allocate_weekly_budget(self) -> None:
        state = copy.deepcopy(self.state)
        state["as_of"] = "2020-01-01"
        result = engine.allocate_weekly_budget(self.constitution, state)

        self.assertGreaterEqual(len(result["warnings"]), 1)
        self.assertEqual(result["warnings"][0]["category"], "stale_data")
        self.assertIn(
            result["warnings"][0]["reason"],
            result["approval_ticket"]["warnings"],
        )

    def test_stale_data_does_not_change_allocation_amounts(self) -> None:
        """Staleness is a warning, not a blocker: the engine should still
        compute the same allocation it would on fresh data with identical
        holdings/budget, just with the warning attached."""
        fresh_state = copy.deepcopy(self.state)
        fresh_state["as_of"] = date.today().isoformat()
        stale_state = copy.deepcopy(self.state)
        stale_state["as_of"] = "2020-01-01"

        fresh_result = engine.allocate_weekly_budget(self.constitution, fresh_state)
        stale_result = engine.allocate_weekly_budget(self.constitution, stale_state)

        self.assertEqual(
            fresh_result["approval_ticket"]["executable_allocation"],
            stale_result["approval_ticket"]["executable_allocation"],
        )


if __name__ == "__main__":
    unittest.main()
