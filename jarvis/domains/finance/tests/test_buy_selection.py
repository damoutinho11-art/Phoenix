"""Synthetic decision-policy tests; no private records or network."""
import copy
import unittest
from datetime import date, timedelta

from jarvis.domains.finance.buy_selection import select_buys

TODAY = date(2026, 9, 8)


def history(growth=0.001, crypto=False):
    start = TODAY - timedelta(days=210)
    return [{'date': (start + timedelta(days=i)).isoformat(), 'close': 100 * (1 + growth) ** i}
            for i in range(210) if crypto or (start + timedelta(days=i)).weekday() < 5]


def candidate(asset='global_core_etf', symbol='VWCE.DE', growth=0.001, lane='etf'):
    return dict(asset=asset, symbol=symbol, lane=lane, name=symbol, currency='EUR',
                history=history(growth, lane == 'crypto'), broker_verified=True,
                verified_at=TODAY.isoformat(), quote_date=TODAY.isoformat(),
                fee_pct=0.5 if lane == 'crypto' else 0, spread_pct=0.05,
                isin=None if lane == 'crypto' else ('IE00BP3QZ601' if asset == 'quality_etf' else 'IE00BK5BQT80'),
                fund_fee_pct=None if lane == 'crypto' else 0.19,
                research_status='EVIDENCE_STRONG', research_as_of=TODAY.isoformat(),
                research_verdict='BUY_CANDIDATE',
                mandate_approved=True, product_type='ETF' if lane == 'etf' else 'CRYPTOCURRENCY',
                source='synthetic', broker_source='https://broker.example')


def inputs():
    constitution = {
        'target_weights': {'global_core_etf': .4, 'quality_etf': .4, 'btc': .1, 'eth': .1, 'tactical_reserve': 0},
        'sleeve_bands': {a: {'max_weight': .6} for a in ['global_core_etf', 'quality_etf']},
        'asset_routes': {'global_core_etf': 'lightyear', 'quality_etf': 'lightyear', 'btc': 'lhv_crypto', 'eth': 'lhv_crypto', 'tactical_reserve': 'cash'},
        'minimum_efficient_buys': {'btc': 20, 'eth': 20},
        'crypto_universe': {'btc': {}, 'eth': {}},
        'crypto_risk_rules': {'btc_max': .25, 'total_crypto_hard_max': .25,
                              'max_total_crypto_buy_fraction_of_weekly_budget': .5},
    }
    portfolio = {'platform_status': {'lightyear_ready': True, 'lhv_crypto_ready': True}}
    holdings = {'global_core_etf': 30000, 'quality_etf': 30000, 'btc': 0, 'eth': 0, 'tactical_reserve': 40000}
    return constitution, portfolio, holdings


def decide(candidates, budget=10000, **changes):
    c, p, h = inputs()
    c.update(changes)
    return select_buys(candidates, c, p, h, budget, TODAY)


class BuySelectionTests(unittest.TestCase):
    def test_empty_provider_close_is_a_reported_gap_not_a_fabricated_price(self):
        row = candidate()
        row['history'][-1]['close'] = float('nan')
        result = decide([row])
        self.assertEqual(result['lanes']['etf']['status'], 'BUY')
        metrics = result['lanes']['etf']['selected']['metrics']
        self.assertEqual(metrics['missing_closes'], 1)
        self.assertNotEqual(metrics['last_close'], row['history'][-1]['date'])

    def test_crypto_symbol_must_match_asset_and_research_must_support_buy(self):
        row = candidate('btc', 'BTC-EUR', lane='crypto')
        for field, value in [('symbol', 'ETH-EUR'), ('research_verdict', 'REJECT'),
                             ('research_verdict', 'WATCH'), ('research_verdict', None)]:
            result = decide([{**row, field: value}])
            self.assertEqual(result['lanes']['crypto']['status'], 'WAIT', (field, value))

    def test_same_fund_listings_get_one_vote_and_cheapest_listing(self):
        original = candidate()
        cheaper = {**original, 'symbol': 'VWCE.OTHER', 'spread_pct': .01}
        result = decide([original, cheaper])
        self.assertEqual(result['lanes']['etf']['status'], 'BUY')
        self.assertEqual(result['lanes']['etf']['selected']['symbol'], 'VWCE.OTHER')
        self.assertEqual(sum(r['eligible'] for r in result['candidates']), 1)

    def test_configured_unknown_crypto_cannot_bypass_engine_support(self):
        c, p, h = inputs()
        c['crypto_universe']['newcoin'] = {}
        c['target_weights']['newcoin'] = .1
        c['asset_routes']['newcoin'] = 'lhv_crypto'
        result = select_buys([candidate('newcoin', 'NEW-EUR', lane='crypto')], c, p, h, 10000, TODAY)
        self.assertEqual(result['lanes']['crypto']['status'], 'WAIT')

    def test_evidence_changes_etf_choice_without_changing_portfolio(self):
        a, b = candidate(), candidate('quality_etf', 'IS3Q.DE', .002)
        self.assertEqual(decide([a, b])['lanes']['etf']['selected']['symbol'], 'IS3Q.DE')
        a['history'] = history(.003)
        self.assertEqual(decide([a, b])['lanes']['etf']['selected']['symbol'], 'VWCE.DE')

    def test_crypto_can_select_eth_and_changes_with_evidence(self):
        a = candidate('btc', 'BTC-EUR', .001, 'crypto')
        b = candidate('eth', 'ETH-EUR', .002, 'crypto')
        result = decide([a, b])
        self.assertEqual(result['lanes']['crypto']['selected']['asset'], 'eth')
        self.assertLessEqual(result['allocations_cents']['eth'], 5000)
        a['history'] = history(.003, True)
        self.assertEqual(decide([a, b])['lanes']['crypto']['selected']['asset'], 'btc')

    def test_ties_wait_instead_of_configured_order(self):
        result = decide([candidate(), candidate('quality_etf', 'IS3Q.DE')])
        self.assertEqual(result['lanes']['etf']['status'], 'WAIT')
        self.assertEqual(result['allocations_cents']['tactical_reserve'], 10000)

    def test_empty_or_invalid_evidence_never_falls_back(self):
        bad_fields = [('broker_verified', False), ('currency', 'USD'), ('spread_pct', None),
                      ('mandate_approved', False), ('product_type', 'EQUITY'), ('source', None),
                      ('fee_pct', float('nan')), ('fund_fee_pct', None), ('isin', 'bad'),
                      ('quote_date', '2026-08-01'), ('verified_at', '2026-09-09')]
        self.assertEqual(decide([])['allocations_cents']['tactical_reserve'], 10000)
        for key, value in bad_fields:
            row = candidate()
            row[key] = value
            with self.subTest(key=key):
                self.assertEqual(decide([row])['lanes']['etf']['status'], 'WAIT')

    def test_crypto_requires_recent_validated_research(self):
        row = candidate('btc', 'BTC-EUR', lane='crypto')
        for key, value in [('research_status', 'NO_EVIDENCE'), ('research_as_of', '2025-01-01')]:
            changed = {**row, key: value}
            self.assertEqual(decide([changed])['lanes']['crypto']['status'], 'WAIT')

    def test_stale_duplicate_gapped_and_insufficient_history_wait(self):
        base = candidate()
        for series in [base['history'][:-30], base['history'][:50],
                       base['history'] + [base['history'][-1]],
                       [x for x in base['history'] if not '2026-07' in x['date']]]:
            self.assertEqual(decide([{**base, 'history': series}])['lanes']['etf']['status'], 'WAIT')

    def test_future_prices_do_not_change_selection(self):
        row = candidate()
        first = decide([row])
        row['history'].append({'date': '2027-01-01', 'close': 999999})
        self.assertEqual(first, decide([row]))

    def test_declining_market_or_costs_consuming_gain_wait(self):
        self.assertEqual(decide([candidate(growth=-.001)])['lanes']['etf']['status'], 'WAIT')
        row = candidate(growth=.00001)
        row['fee_pct'] = 1
        self.assertEqual(decide([row])['lanes']['etf']['status'], 'WAIT')

    def test_budget_conservation_no_mutation_and_lane_isolation(self):
        rows = [candidate(), candidate('btc', 'BTC-EUR', lane='crypto')]
        before = copy.deepcopy(rows)
        result = decide(rows, budget=10001)
        self.assertEqual(sum(result['allocations_cents'].values()), 10001)
        self.assertEqual(rows, before)
        rows[1]['broker_verified'] = False
        result = decide(rows)
        self.assertEqual(result['lanes']['etf']['status'], 'BUY')
        self.assertEqual(result['lanes']['crypto']['status'], 'WAIT')

    def test_no_route_or_target_room_means_no_buy(self):
        c, p, h = inputs()
        p['platform_status']['lightyear_ready'] = False
        self.assertEqual(select_buys([candidate()], c, p, h, 10000, TODAY)['lanes']['etf']['status'], 'WAIT')
        row = candidate('unsupported', 'OTHER.DE')
        self.assertEqual(decide([row])['lanes']['etf']['status'], 'WAIT')

    def test_total_crypto_cap_counts_eth_and_other_configured_crypto(self):
        c, p, h = inputs()
        h['eth'] = 100000
        result = select_buys([candidate('btc', 'BTC-EUR', lane='crypto')], c, p, h, 10000, TODAY)
        self.assertEqual(result['lanes']['crypto']['status'], 'WAIT')

    def test_candidate_cannot_relabel_crypto_as_etf_to_escape_limits(self):
        row = candidate('btc', 'BTC-EUR', lane='etf')
        self.assertEqual(decide([row])['lanes']['etf']['status'], 'WAIT')

    def test_missing_competing_evidence_prevents_claiming_a_winner(self):
        rival = candidate('quality_etf', 'IS3Q.DE', .002)
        for field in ('spread_pct', 'currency'):
            self.assertEqual(decide([candidate(), {**rival, field: None}])['lanes']['etf']['status'], 'WAIT')


if __name__ == '__main__':
    unittest.main()
