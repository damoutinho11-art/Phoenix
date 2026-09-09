import copy
from datetime import timedelta
import unittest
from unittest.mock import patch

from jarvis.domains.finance.price_policy_study import study
from jarvis.domains.finance.tests.test_buy_selection import TODAY, history


class PricePolicyStudyTests(unittest.TestCase):
    def data(self):
        return {'A': history() + [{'date': (TODAY + timedelta(days=i)).isoformat(), 'close': 150+i}
                                 for i in range(31)]}

    def test_forward_prices_change_outcome_not_historical_selection(self):
        data = self.data()
        with patch('jarvis.domains.finance.price_policy_study.UNIVERSE', {'etf': ['A']}):
            first = study(data, [TODAY], {'etf': [.1]})
            changed = copy.deepcopy(data)
            changed['A'][-1]['close'] = 1
            second = study(changed, [TODAY], {'etf': [.1]})
        self.assertEqual(first['windows'][0]['selected'], 'A')
        self.assertEqual(second['windows'][0]['selected'], 'A')
        expected = 100 * (180 / 150 * (1-.0005)/(1+.0005) - 1)
        self.assertAlmostEqual(first['windows'][0]['policy_return_pct'], expected)
        self.assertLess(second['windows'][0]['policy_return_pct'], 0)

    def test_incomplete_forward_comparison_is_excluded_not_filled_with_zero(self):
        with patch('jarvis.domains.finance.price_policy_study.UNIVERSE', {'etf': ['A']}):
            result = study({'A': history()}, [TODAY], {'etf': [.1]})
        self.assertEqual(result['windows'], [])
        self.assertEqual(result['summary'], [])
