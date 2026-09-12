import unittest
from jarvis.domains.finance.contribution_selection import select_contributions
from jarvis.domains.finance.tests.test_buy_selection import inputs, candidate, TODAY


def choose(rows, holdings=None):
    c, p, h = inputs()
    return select_contributions(rows, c, p, holdings or h, 10000, TODAY, horizon_years=20)


class ContributionSelectionTests(unittest.TestCase):
    def test_crypto_wait_summary_explains_research_blocker(self):
        row = candidate('eth', 'ETH-EUR', lane='crypto')
        row.update(research_verdict='WATCH', research_review_reason='WATCH: marginal portfolio benefit is unresolved.')
        result = choose([row])
        self.assertEqual(result['lanes']['crypto']['status'], 'WAIT')
        self.assertIn('marginal portfolio benefit', result['lanes']['crypto']['reason'])

    def test_missing_horizon_waits_for_etf_but_preserves_crypto_independence(self):
        c,p,h = inputs()
        result = select_contributions([candidate(), candidate('eth','ETH-EUR',lane='crypto')],
            c,p,h,10000,TODAY,horizon_years=None)
        self.assertEqual(result['lanes']['etf']['status'], 'WAIT')
        self.assertIn('horizon', result['lanes']['etf']['reason'])
        self.assertEqual(result['lanes']['crypto']['status'], 'BUY')

    def test_conflicting_fees_for_same_share_class_block_comparison(self):
        a = {**candidate(), 'fund_fee_pct': .3, 'spread_pct': .01}
        b = {**candidate(symbol='OTHER.DE'), 'fund_fee_pct': .1, 'spread_pct': .05}
        c = {**candidate(symbol='THIRD.DE'), 'isin':'IE00B3YLTY66','fund_fee_pct':.2}
        self.assertEqual(choose([a,b,c])['lanes']['etf']['status'], 'WAIT')

    def test_declining_prices_do_not_veto_verified_long_term_contribution(self):
        result = choose([candidate(growth=-.001)])
        self.assertEqual(result['lanes']['etf']['status'], 'BUY')
        self.assertLess(result['lanes']['etf']['selected']['metrics']['return_90_pct'], 0)

    def test_larger_target_shortfall_wins_over_recent_price_performance(self):
        _, _, h = inputs()
        h['global_core_etf'] = 0
        result = choose([candidate(growth=-.001), candidate('quality_etf','IS3Q.DE', .005)], h)
        self.assertEqual(result['lanes']['etf']['selected']['symbol'], 'VWCE.DE')

    def test_lower_verified_cost_wins_within_same_portfolio_need(self):
        a = candidate()
        a['fund_fee_pct'] = .14
        b = {**candidate(symbol='SPYI.DE', growth=.005), 'isin': 'IE00B3YLTY66', 'fund_fee_pct': .17}
        self.assertEqual(choose([a, b])['lanes']['etf']['selected']['symbol'], 'VWCE.DE')
        b['spread_pct'] = None
        result = choose([a, b])
        self.assertEqual(result['lanes']['etf']['status'], 'BUY')
        self.assertIn('lower bound', result['lanes']['etf']['alternatives'][1]['reason'])
        b['fund_fee_pct'] = .1
        self.assertEqual(choose([a, b])['lanes']['etf']['status'], 'WAIT')

    def test_incomplete_higher_priority_or_unverified_fee_rival_blocks(self):
        a, b = candidate(), candidate('quality_etf','IS3Q.DE')
        b.update(spread_pct=None, fund_fee_pct=None)
        self.assertEqual(choose([a,b])['lanes']['etf']['status'], 'WAIT')

    def test_crypto_research_and_caps_remain_required_and_budget_conserved(self):
        crypto = candidate('eth','ETH-EUR',-.001,'crypto')
        result = choose([candidate(), crypto])
        self.assertEqual(result['lanes']['crypto']['status'], 'BUY')
        self.assertLessEqual(result['allocations_cents']['eth'], 5000)
        self.assertEqual(sum(result['allocations_cents'].values()), 10000)
        crypto['research_verdict'] = 'REJECT'
        self.assertEqual(choose([crypto])['lanes']['crypto']['status'], 'WAIT')

    def test_tied_distinct_instruments_wait(self):
        a = candidate()
        b = {**candidate(symbol='OTHER.DE'), 'isin': 'IE00B3YLTY66'}
        self.assertEqual(choose([a,b])['lanes']['etf']['status'], 'WAIT')
