from datetime import date
import pytest

from jarvis.domains.finance.optimizer_evidence import reconcile_holdings, eligible_candidates, prepare_snapshot, replay_snapshot
from jarvis.domains.finance.tests.test_buy_selection import candidate, inputs, TODAY


def test_all_legacy_exposures_are_included_and_bonds_are_not_cash():
    values, provenance = reconcile_holdings({'holdings': {'btc': 10, 'tactical_reserve': 2},
        'legacy_holdings': {'lhv_growth_euro_bond': 30, 'lhv_growth_cash_pending_settlement': 4}})
    assert values == {'CASH': 600, 'BTC-EUR': 1000, 'IEAG.L': 3000}
    assert provenance


def test_unknown_and_unreconciled_holdings_block():
    for state in [ {'holdings': {'mystery': 10}},
        {'holdings': {'btc': None}},
        {'holdings': {'btc': 10}, 'positions': {'btc': {'BTC-EUR': {'units': 1, 'value_eur': 11}}}},
        {'holdings': {}, 'positions': {'btc': {'BTC-EUR': {'units': 1, 'value_eur': 11}}}}]:
        with pytest.raises(ValueError):
            reconcile_holdings(state)


def test_exact_instrument_positions_replace_sleeve_proxy():
    values, _ = reconcile_holdings({'holdings': {'global_core_etf': 30}, 'positions': {
        'global_core_etf': {'VWCE.DE': {'units': 1, 'value_eur': 10}, 'IUSQ.DE': {'units': 2, 'value_eur': 20}}}})
    assert values == {'CASH': 0, 'VWCE.DE': 1000, 'IUSQ.DE': 2000}


def test_evidence_gate_has_no_btc_ceiling_but_keeps_broker_research_requirements():
    c, p, h = inputs()
    h['btc'] = 10000000
    rows = eligible_candidates([candidate('btc', 'BTC-EUR', lane='crypto')], c, p, h, 10000, TODAY)
    assert rows[0]['eligible']
    assert rows[0]['room_cents'] == 10000
    p['platform_status']['lhv_crypto_ready'] = False
    assert not eligible_candidates([candidate('btc', 'BTC-EUR', lane='crypto')], c, p, h, 10000, TODAY)[0]['eligible']
    p['platform_status']['lhv_crypto_ready'] = True
    assert not eligible_candidates([{**candidate('btc', 'BTC-EUR', lane='crypto'), 'research_status': 'NO_EVIDENCE'}], c, p, h, 10000, TODAY)[0]['eligible']


def test_same_share_class_gets_one_venue_and_conflicting_sleeves_are_excluded():
    c, p, h = inputs()
    a = candidate()
    rows = eligible_candidates([a, {**a, 'symbol': 'OTHER.DE', 'spread_pct': .01}], c,p,h,10000,TODAY)
    assert [r['symbol'] for r in rows if r['eligible']] == ['OTHER.DE']
    rows = eligible_candidates([a, {**a, 'asset': 'quality_etf', 'symbol': 'OTHER.DE'}], c,p,h,10000,TODAY)
    assert not any(r['eligible'] for r in rows)
    rows = eligible_candidates([a, {**a, 'fund_fee_pct':.7, 'symbol':'OTHER.DE'}], c,p,h,10000,TODAY)
    assert not any(r['eligible'] for r in rows)


def test_snapshot_replays_exact_inputs_without_current_network_or_profile():
    snapshot = prepare_snapshot({'CASH': 10000}, [], {}, 1000, date(2026,9,10),
        {'time_horizon_years': 20, 'max_acceptable_drawdown_pct': 40}, {'source': 'synthetic'})
    result = replay_snapshot(snapshot)
    assert result['status'] == 'INSUFFICIENT_DATA'
    assert snapshot['model_version'] == result['model_version']


def test_empty_provider_closes_are_disclosed_without_interpolation():
    from unittest.mock import patch, Mock
    import pandas as pd
    from jarvis.domains.finance.optimizer_evidence import fetch_eur_history
    ticker = Mock()
    ticker.history.return_value = pd.DataFrame({'Close':[100,float('nan'),102]},
        index=pd.to_datetime(['2026-09-04','2026-09-07','2026-09-08']))
    ticker.get_history_metadata.return_value = {'currency':'EUR'}
    with patch('yfinance.Ticker',return_value=ticker):
        result = fetch_eur_history('VWCE.DE',TODAY)
    assert len(result['history']) == 2
    assert result['omitted_provider_closes'] == 1


def test_foreign_history_uses_same_date_eur_fx_and_discloses_missing_dates():
    from unittest.mock import patch, Mock
    import pandas as pd
    from jarvis.domains.finance.optimizer_evidence import fetch_eur_history
    instrument, fx = Mock(), Mock()
    instrument.history.return_value = pd.DataFrame({'Close':[100,110]},index=pd.to_datetime(['2026-09-04','2026-09-07']))
    instrument.get_history_metadata.return_value = {'currency':'USD'}
    fx.history.return_value = pd.DataFrame({'Close':[.9]},index=pd.to_datetime(['2026-09-04']))
    fx.get_history_metadata.return_value = {'currency':'EUR'}
    with patch('yfinance.Ticker', side_effect=lambda s: fx if s=='USDEUR=X' else instrument):
        result = fetch_eur_history('SWRD.L',TODAY)
    assert result['history'] == [{'date':'2026-09-04','close':90}]
    assert result['missing_fx_dates'] == 1
