from datetime import date, timedelta
from unittest.mock import patch
import pytest
from jarvis.domains.finance.optimizer_study import study


def test_deposits_do_not_hide_losses_and_strategies_use_same_contributions():
    histories = {s: [{'date':(date(2024,1,1)+timedelta(days=i)).isoformat(),'close':100 if i<31 else 50} for i in range(33)]
        for s in ('VWCE.DE','BTC-EUR')}
    with patch('jarvis.domains.finance.optimizer_study.optimize_portfolio', return_value={
        'status':'INSUFFICIENT_DATA','selected_plan':None}):
        report = study(histories, [date(2024,1,2),date(2024,2,2)], costs={'etf':0,'crypto':0})
    rows = {r['strategy']: r for r in report['summary']}
    assert all(r['contributions_eur'] == 200 for r in rows.values())
    assert rows['broad_etf']['time_weighted_return_pct'] == pytest.approx(-50)
    assert rows['broad_etf']['max_drawdown_pct'] == pytest.approx(50)
    assert rows['broad_etf']['ending_value_eur'] == 150
    assert rows['optimizer']['ending_value_eur'] == 200


def test_signal_inputs_end_before_cutoff_and_execution_uses_next_common_close():
    start = date(2021,1,1)
    histories = {s:[{'date':(start+timedelta(days=i)).isoformat(),'close':100+i/20}
        for i in range(1200) if (start+timedelta(days=i)).weekday()<5]
        for s in ('VWCE.DE','BTC-EUR')}
    observed = []
    def optimizer(holdings, rows, inputs, budget, cutoff, **kwargs):
        observed.append((cutoff,inputs))
        return {'status':'INSUFFICIENT_DATA','selected_plan':None}
    with patch('jarvis.domains.finance.optimizer_study.optimize_portfolio',side_effect=optimizer):
        report = study(histories,[date(2024,1,6)],costs={'etf':0,'crypto':0})
    assert all(date.fromisoformat(p['date']) < cutoff for cutoff,h in observed for points in h.values() for p in points)
    assert report['decisions'][0]['execution_date'] == '2024-01-08'


def test_invalid_or_duplicate_input_prices_are_rejected():
    for price in (float('inf'), -1, None):
        with pytest.raises(ValueError):
            study({'VWCE.DE':[{'date':'2024-01-01','close':price}]}, [], costs={'etf':0,'crypto':0})


def test_archived_configuration_is_independent_of_later_system_date():
    from jarvis.domains.finance.optimizer_study import evaluate_configuration
    config = {'cutoffs':['2024-01-02'],'cost_cases':[{'etf':0,'crypto':0}],
        'contribution_cents':10000,'horizon_years':20,'tolerance':40}
    histories = {s:[{'date':'2024-01-01','close':100},{'date':'2024-01-02','close':100},
        {'date':'2024-01-03','close':101}] for s in ('VWCE.DE','BTC-EUR')}
    expected = evaluate_configuration(histories,config)
    class LaterDate(date):
        @classmethod
        def today(cls):
            return cls(2030,1,1)
    with patch('jarvis.domains.finance.optimizer_study.date', LaterDate):
        assert evaluate_configuration(histories,config) == expected
