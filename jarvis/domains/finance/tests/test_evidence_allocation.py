import copy
import unittest
from jarvis.domains.finance import engine
from jarvis.domains.finance.tests.test_buy_selection import TODAY, candidate, inputs


def state():
    c, p, h = inputs()
    c.update(manual_approval_required=True, no_auto_trading=True, no_broker_connections=True,
             no_api_keys=True, no_network_calls=True, rules={}, legacy_holding_policy={})
    p.update(holdings={a: v / 100 for a, v in h.items()}, weekly_investment_budget=100,
             emergency_fund={'amount': 1000}, as_of=TODAY.isoformat())
    return c, p


class EvidenceAllocationTests(unittest.TestCase):
    def test_empty_evidence_stays_in_reserve_not_legacy_fallback(self):
        c, p = state()
        result = engine.allocate_weekly_budget(c, p, selection_evidence={'candidates': []}, as_of=TODAY)
        self.assertEqual(result['executable_allocations_cents']['tactical_reserve'], 10000)
        self.assertEqual(result['weekly_dual_lane_mandate']['crypto_lane']['status'], 'WAIT_FOR_EVIDENCE')

    def test_actual_allocation_ticket_and_mandate_use_evidence_winner(self):
        c, p = state()
        before = copy.deepcopy(p)
        evidence = {'candidates': [candidate(), candidate('quality_etf', 'IS3Q.DE', .002), candidate('eth', 'ETH-EUR', .002, 'crypto')]}
        result = engine.allocate_weekly_budget(c, p, selection_evidence=evidence, as_of=TODAY)
        self.assertGreater(result['executable_allocations_cents']['quality_etf'], 0)
        self.assertEqual(result['executable_allocations_cents']['global_core_etf'], 0)
        self.assertEqual(result['approval_ticket']['executable_allocation']['eth'], 50)
        self.assertEqual(result['weekly_dual_lane_mandate']['crypto_lane']['asset'], 'eth')
        self.assertEqual(p, before)

    def test_crypto_accounting_counts_eth_sol(self):
        c, p = state()
        status = engine.crypto_risk_status(c, {'eth': 20000, 'sol': 10000, 'btc': 0, 'global_core_etf': 70000}, {}, 0)
        self.assertEqual(status['total_crypto_weight'], .3)
        self.assertEqual(status['total_crypto_room_cents'], 0)

    def test_expansion_uses_existing_phase_rules_and_does_not_mutate_constitution(self):
        c, _ = state()
        del c['target_weights']['eth']
        c['target_weights']['btc'] = .2
        c['crypto_universe'] = {'btc': {'sleeve_weight_pct': 60, 'phase_unlock': 1},
                                'eth': {'sleeve_weight_pct': 25, 'phase_unlock': 2, 'platform': 'lhv_crypto'}}
        expanded = engine.expand_evidence_constitution(c)
        self.assertIn('eth', expanded['target_weights'])
        self.assertNotIn('eth', c['target_weights'])
        targets = {'global_core': .6, 'growth_thematic': .2, 'crypto': .2, 'cash': 0}
        self.assertEqual(engine.compute_asset_target_weights(targets, expanded, 1)['eth'], 0)
        self.assertGreater(engine.compute_asset_target_weights(targets, expanded, 2)['eth'], 0)


if __name__ == '__main__':
    unittest.main()
