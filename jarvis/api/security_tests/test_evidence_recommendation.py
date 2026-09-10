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

    def test_mixed_fund_accounting_survives_api_apply_and_void_helpers(self):
        from jarvis.api.routers.finance import _apply_transaction_to_portfolio_state, _reverse_transaction_in_portfolio_state
        original = {'holdings': {'global_core_etf': 300}, 'units': {'global_core_etf': 2}}
        tx = {'id': 9, 'asset': 'global_core_etf', 'symbol': 'SPYI.DE', 'amount_eur': 100, 'units': 10}
        updated, before, after = _apply_transaction_to_portfolio_state(tx, original)
        self.assertEqual(updated['positions']['global_core_etf']['SPYI.DE']['units'], 10)
        self.assertIsNone(updated['units']['global_core_etf'])
        reversed_state, _, _ = _reverse_transaction_in_portfolio_state(tx, updated)
        self.assertEqual(reversed_state['holdings'], original['holdings'])

    def test_mixed_funds_have_no_aggregate_average_unit_price(self):
        from jarvis.api.routers import finance
        state = {'holdings': {'global_core_etf': 400}, 'positions': {'global_core_etf':
                 {'VWCE.DE': {'units': 2, 'value_eur': 300}, 'SPYI.DE': {'units': 10, 'value_eur': 100}}}}
        with patch.object(finance.database, 'get_pnl_cost_basis', return_value={
            'global_core_etf': {'cost_basis_eur': 400, 'total_units_bought': 12}}):
            result = finance.finance_pnl(state)['pnl'][0]
        self.assertIsNone(result['avg_price_eur'])
        self.assertIsNone(result['units'])

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
                self.assertIn('decision_comparison', data['buy_selection'])
                self.assertIn('portfolio value', data['rationale'])
                self.assertIsNone(data['brief_id'], 'An unrelated stored brief must never authorize the new decision')
                self.assertTrue(saved.called, 'Changed evidence decisions need a new saved snapshot')
                import json
                archived = json.loads(saved.call_args.kwargs['full_brief_json'])
                self.assertIn('decision_replay_snapshot', archived)
                self.assertNotIn('decision_replay_snapshot', data, 'Raw research history belongs in the private archive, not every response')
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
