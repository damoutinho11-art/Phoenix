"""Replay validation is synthetic, not evidence of investment performance."""
import copy
import unittest
from datetime import timedelta
from jarvis.domains.finance.buy_replay import replay_snapshots
from jarvis.domains.finance.tests.test_buy_selection import TODAY, candidate, inputs


class BuyReplayTests(unittest.TestCase):
    def test_forward_prices_score_outcomes_but_cannot_change_past_decision(self):
        c, p, h = inputs()
        row = candidate()
        row['history'] += [{'date': (TODAY + timedelta(days=i)).isoformat(), 'close': 150 + i}
                           for i in range(31)]
        snapshot = dict(as_of=TODAY.isoformat(), candidates=[row], constitution=c,
                        portfolio_state=p, holdings_cents=h, weekly_budget_cents=10000)
        first = replay_snapshots([snapshot])
        changed = copy.deepcopy(snapshot)
        changed['candidates'][0]['history'][-1]['close'] = 300
        second = replay_snapshots([changed])
        self.assertEqual(first['decisions'], second['decisions'])
        self.assertNotEqual(first['outcomes'], second['outcomes'])
        self.assertIn('target_gap', first['outcomes'][0])
        self.assertEqual(first['outcomes'][0]['cash_return_pct'], 0)

    def test_missing_future_prices_are_not_reported_as_zero_return(self):
        c, p, h = inputs()
        report = replay_snapshots([dict(as_of=TODAY.isoformat(), candidates=[candidate()],
            constitution=c, portfolio_state=p, holdings_cents=h, weekly_budget_cents=10000)])
        etf = next(row for row in report['outcomes'] if row['lane'] == 'etf')
        self.assertIsNone(etf['selected']['net_return_pct'])
