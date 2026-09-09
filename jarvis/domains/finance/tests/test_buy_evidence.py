"""Public adapter tests use only synthetic provider responses."""
import unittest
from datetime import date
from unittest.mock import patch
from jarvis.domains.finance import buy_evidence


class BuyEvidenceTests(unittest.TestCase):
    def test_crypto_reference_quote_is_dated_eur_and_explicitly_not_broker_quote(self):
        payload = '{"bid":"99", "ask":"101", "time":"2026-09-08T12:00:00Z"}'
        with patch.object(buy_evidence, '_public_text', return_value=payload):
            quote = buy_evidence.crypto_reference_quote('BTC-EUR')
        self.assertEqual(quote['spread_pct'], 2)
        self.assertEqual(quote['quote_date'], '2026-09-08')
        self.assertFalse(quote['broker_execution_quote'])
        self.assertIn('coinbase.com/products/BTC-EUR', quote['quote_source'])
        with patch.object(buy_evidence, '_public_text') as fetch:
            self.assertIsNone(buy_evidence.crypto_reference_quote('BTC-USD')['spread_pct'])
            fetch.assert_not_called()

    def tearDown(self):
        buy_evidence.clear_cache()

    def test_universe_includes_configured_eth_sol_and_additional_etfs(self):
        c = {'crypto_universe': {'eth': {'ticker_yahoo': 'ETH-EUR'}, 'sol': {'ticker_yahoo': 'SOL-EUR'}},
             'evidence_candidates': [{'asset': 'global_core_etf', 'symbol': 'EXTRA.DE', 'lane': 'etf', 'name': 'Extra fund'}]}
        rows = buy_evidence.candidate_universe(c)
        self.assertTrue({'ETH-EUR', 'SOL-EUR', 'EXTRA.DE'} <= {r['symbol'] for r in rows})

    def test_cache_is_keyed_by_universe_and_returns_defensive_copies(self):
        c = {'crypto_universe': {}}
        with patch.object(buy_evidence, '_fetch_candidate', side_effect=lambda row, today: {**row, 'history': []}) as fetch:
            first = buy_evidence.fetch_evidence(c, date(2026, 9, 8))
            calls = fetch.call_count
            first['candidates'][0]['name'] = 'mutated'
            again = buy_evidence.fetch_evidence(c, date(2026, 9, 8))
            self.assertEqual(calls, fetch.call_count)
            self.assertNotEqual(again['candidates'][0]['name'], 'mutated')
            buy_evidence.fetch_evidence({'crypto_universe': {'eth': {'ticker_yahoo': 'ETH-EUR'}}}, date(2026, 9, 8))
            self.assertGreater(fetch.call_count, calls)

    def test_failure_stays_missing_and_sanitized(self):
        with patch.object(buy_evidence, '_fetch_candidate', side_effect=RuntimeError('sensitive URL must not escape')):
            result = buy_evidence.fetch_evidence({'crypto_universe': {}}, date(2026, 9, 8))
        self.assertTrue(result['candidates'])
        self.assertTrue(all(r['history'] == [] for r in result['candidates']))
        self.assertNotIn('sensitive URL', str(result))

    def test_quote_requires_real_bid_ask_and_timestamp(self):
        quote = buy_evidence.quote_evidence({'bid': 99, 'ask': 101, 'regularMarketTime': 1788825600})
        self.assertEqual(quote['spread_pct'], 2)
        self.assertIsNone(buy_evidence.quote_evidence({'regularMarketPrice': 100})['spread_pct'])

    def test_product_identity_and_fees_are_bound_to_matching_fund(self):
        document = '<div>0.14% Annual fund charges</div><script>{"symbol":"VWCE","name":"Vanguard","exchange":"XETRA","isin":"IE00BK5BQT80"}</script>'
        pricing = '<div>Exchange traded funds (ETFs) No execution or custody fees.</div>'
        row = {'symbol': 'VWCE.DE', 'lane': 'etf'}
        result = buy_evidence.parse_broker_document(row, document, pricing)
        self.assertEqual(result['isin'], 'IE00BK5BQT80')
        self.assertEqual(result['fee_pct'], 0)
        self.assertEqual(result['fund_fee_pct'], .14)
        self.assertIsNone(buy_evidence.parse_broker_document({**row, 'symbol': 'OTHER.DE'}, document, pricing)['isin'])

    def test_scripts_cannot_supply_visible_fee_claim(self):
        result = buy_evidence.parse_broker_document({'symbol': 'VWCE.DE', 'lane': 'etf'}, '', '<script>Exchange traded funds (ETFs) No execution or custody fees.</script>')
        self.assertIsNone(result['fee_pct'])

    def test_crypto_official_name_symbol_and_fee(self):
        result = buy_evidence.parse_broker_document({'symbol': 'BTC-EUR', 'lane': 'crypto', 'name': 'Bitcoin'}, '<h3>Bitcoin <span>BTC</span></h3><p>A 0.5% service fee applies to buy and sell.</p>')
        self.assertTrue(result['broker_verified'])
        self.assertEqual(result['fee_pct'], .5)


if __name__ == '__main__':
    unittest.main()
