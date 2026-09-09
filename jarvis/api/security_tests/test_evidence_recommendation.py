"""Authenticated real-router integration, exclusively synthetic data."""
from contextlib import ExitStack
import os
import unittest
from unittest.mock import patch

from jarvis.api.security_tests import test_app_access_control as access_fixture
from jarvis.domains.finance.tests.test_evidence_allocation import state
from jarvis.domains.finance.tests.test_buy_selection import candidate, TODAY


class EvidenceRecommendationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        access_fixture.AppAccessControlTests.setUpClass()
        cls.client = access_fixture.AppAccessControlTests.client

    @classmethod
    def tearDownClass(cls):
        access_fixture.AppAccessControlTests.tearDownClass()

    def test_manual_preview_can_record_new_eth_without_mutating_input(self):
        from jarvis.api.routers.finance import _build_transaction_apply_preview
        original = {'holdings': {'btc': 100}, 'units': {'btc': .001}}
        before, after = _build_transaction_apply_preview({'asset': 'eth', 'amount_eur': 25, 'units': .01}, original)
        self.assertNotIn('eth', original['holdings'])
        self.assertEqual(after['holdings']['eth'], 25)
        self.assertEqual(after['units']['eth'], .01)

    def test_recommendation_and_checklist_share_real_evidence_selection(self):
        self.check_selection(candidate(), 'global_core_etf', 'VWCE.DE')

    def test_crypto_recommendation_and_checklist_select_eth_with_validated_research(self):
        self.check_selection(candidate('eth', 'ETH-EUR', .002, 'crypto'), 'eth', 'ETH-EUR')

    def test_contribution_policy_keeps_verified_buy_during_declining_prices(self):
        self.check_selection(candidate(growth=-.001), 'global_core_etf', 'VWCE.DE',
                             mode='contribution_v2', policy='contribution-v2')

    def check_selection(self, evidence_row, expected_asset, expected_symbol, mode='evidence_v1', policy='evidence-buy-v1'):
        from jarvis.api import dependencies
        from jarvis.api.routers import finance
        c, p = state()
        overrides = {dependencies.get_finance_constitution: lambda: c,
                     dependencies.get_portfolio_state: lambda: p,
                     dependencies.get_finance_profile: lambda: {'risk_profile': {'time_horizon_years': 20}}}
        app = access_fixture.AppAccessControlTests.app
        app.dependency_overrides.update(overrides)
        try:
            with ExitStack() as stack:
                stack.enter_context(patch.dict(os.environ, {'PHOENIX_FINANCE_SELECTION_MODE': mode, 'PHOENIX_FINANCE_FAIL_CLOSED': 'false'}))
                stack.enter_context(patch.object(finance.clock, 'today', return_value=TODAY))
                stack.enter_context(patch.object(finance, 'current_week_lifecycle', return_value={'week_label': 'W37 2026', 'week_closed': False, 'applied_transactions': [], 'latest_brief': None}))
                stack.enter_context(patch.object(finance, '_cashflow_authority_for_today', return_value={'data_ready': True, 'weekly_budget_eur': 100}))
                stack.enter_context(patch.object(finance, 'authoritative_portfolio_state', side_effect=lambda p, a: p))
                stack.enter_context(patch.object(finance, 'detect_market_regime', return_value=None))
                stack.enter_context(patch.object(finance, '_build_research_leg_context', return_value={'memo_id': None, 'evidence_status': 'NO_EVIDENCE'}))
                stack.enter_context(patch.object(finance.database, 'brief_exists_for_week', return_value=True))
                stack.enter_context(patch.object(finance.database, 'get_latest_brief_for_week', return_value={'id': 42, 'status': 'pending', 'full_brief_json': '{}'}))
                saved = stack.enter_context(patch.object(finance.database, 'save_brief'))
                stack.enter_context(patch.object(finance.database, 'find_active_research_memo_for_leg', return_value={'id': 1, 'verdict': 'BUY_CANDIDATE', 'research_quality_checked_at': TODAY.isoformat()}))
                stack.enter_context(patch.object(finance.database, 'get_research_memo_evidence_summary', return_value={'evidence_status': 'EVIDENCE_STRONG'}))
                stack.enter_context(patch.object(finance.database, 'list_research_validation_records_by_memo_id', return_value=[{'created_at': TODAY.isoformat()}]))
                stack.enter_context(patch('jarvis.api.buy_recommendation.fetch_evidence', return_value={'candidates': [evidence_row]}))
                stack.enter_context(patch('jarvis.data.database.get_db', side_effect=AssertionError('Private database accessed')))
                headers = {'Authorization': f'Bearer {access_fixture.KEY}'}
                response = self.client.get('/finance/recommendation', headers=headers)
                self.assertEqual(response.status_code, 200, response.text)
                data = response.json()
                self.assertEqual(data['buy_selection']['policy_version'], policy)
                self.assertIsNone(data['brief_id'], 'An unrelated stored brief must never authorize the new decision')
                self.assertTrue(saved.called, 'Changed evidence decisions need a new saved snapshot')
                self.assertEqual(len(data['recommendations']), 1)
                leg = data['recommendations'][0]
                self.assertEqual(finance._recommendation_provenance(leg)['provenance_classification'],
                                 'CONFIGURED_CANDIDATE_LIVE_PRICE')
                self.assertEqual(leg['asset'], expected_asset)
                self.assertEqual(leg['instrument']['resolved_candidate']['symbol'], expected_symbol)
                checklist = self.client.get('/finance/manual-buy-checklist', headers=headers).json()
                item = checklist['checklist_items'][0]
                self.assertEqual(item['amount'], leg['amount'])
                self.assertIn(expected_symbol, str(item))
                self.assertNotIn('tactical_reserve', [x['asset'] for x in data['recommendations']])
        finally:
            app.dependency_overrides.clear()


if __name__ == '__main__':
    unittest.main()
