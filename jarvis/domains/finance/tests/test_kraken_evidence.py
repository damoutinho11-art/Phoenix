import unittest
from datetime import date
from unittest.mock import patch
from jarvis.domains.finance.kraken_evidence import fetch_crypto_evidence


class KrakenEvidenceTests(unittest.TestCase):
    def payload(self, endpoint):
        if endpoint.startswith('AssetPairs'):
            result = {'HYPEEUR': {'base': 'HYPE', 'quote': 'ZEUR', 'wsname': 'HYPE/EUR', 'status': 'online'}}
        elif endpoint.startswith('OHLC'):
            result = {'HYPEEUR': [[1788739200, '1', '1', '1', '10', '1', '5', 3],
                                   [1788825600, '1', '1', '1', '999', '1', '5', 3]], 'last': 1788825600}
        elif endpoint.startswith('Ticker'):
            result = {'HYPEEUR': {'b': ['99'], 'a': ['101']}}
        else:
            result = {'unixtime': 1788912000}
        return result

    def test_identity_and_completed_candles_are_bound_to_eur_pair(self):
        with patch('jarvis.domains.finance.kraken_evidence._get', side_effect=self.payload):
            data = fetch_crypto_evidence('HYPE-EUR', date(2026, 9, 9))
        self.assertEqual(data['currency'], 'EUR')
        self.assertEqual(data['spread_pct'], 2)
        self.assertEqual(len(data['history']), 1)
        self.assertEqual(data['history'][0]['close'], 10)
        self.assertFalse(data['broker_execution_quote'])

    def test_mismatched_pair_and_noncanonical_symbols_are_rejected(self):
        with patch('jarvis.domains.finance.kraken_evidence._get', return_value={
                'HYPEEUR': {'base': 'ETH', 'quote': 'ZEUR', 'wsname': 'ETH/EUR', 'status': 'online'}}):
            with self.assertRaises(ValueError):
                fetch_crypto_evidence('HYPE-EUR', date(2026, 9, 9))
        with self.assertRaises(ValueError):
            fetch_crypto_evidence('HYPE-USD', date(2026, 9, 9))
