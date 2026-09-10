"""Replay validation is synthetic, not evidence of investment performance."""
import copy
import unittest
from datetime import timedelta
from jarvis.domains.finance.buy_replay import replay_snapshots, capture_snapshot
from jarvis.domains.finance.tests.test_buy_selection import TODAY, candidate, inputs


class BuyReplayTests(unittest.TestCase):
    def test_archival_preserves_invalid_history_instead_of_turning_it_into_a_gap(self):
        from jarvis.domains.finance.contribution_selection import select_contributions
        import json
        c,p,h = inputs()
        for value in (float('inf'), -float('inf'), float('nan')):
            row = candidate()
            row['history'][-5]['close'] = value
            expected = select_contributions([row], c,p,h,10000,TODAY,horizon_years=20)
            snapshot = capture_snapshot([row],c,p,h,10000,TODAY,'contribution-v2',20)
            encoded = json.dumps(snapshot, allow_nan=False)
            actual = replay_snapshots([json.loads(encoded)])['decisions'][0]
            self.assertEqual(actual, expected)

    def test_capture_replays_contribution_policy_and_excludes_unneeded_private_fields(self):
        c, p, h = inputs()
        p['private_note'] = 'not required for selector replay'
        snapshot = capture_snapshot([candidate(growth=-.001)], c,p,h,10000,TODAY,
                                    'contribution-v2', 20)
        self.assertNotIn('private_note', snapshot['portfolio_state'])
        self.assertEqual(snapshot['implementation_version'], 'portfolio-foundation-v1')
        report = replay_snapshots([snapshot])
        self.assertEqual(report['decisions'][0]['policy_version'], 'contribution-v2')
        self.assertEqual(report['decisions'][0]['lanes']['etf']['status'], 'BUY')

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
