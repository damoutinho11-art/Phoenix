from datetime import date, datetime
import pytest

TODAY=date(2026,9,12)
ISIN='IE00BMFKG444'

def document():
    return '<table><tr><td>A2QJU3</td><td>XNAS</td><td>IE00BMFKG444</td><td>EUR</td></tr></table><strong id="bid">58,74</strong><strong id="ask">58,79</strong><td id="bidsize">800</td><td id="asksize">800</td><span id="rt_datum">11.09.2026</span><span id="rt_zeit">22:00:00</span>'

def test_quote_is_bound_to_share_class_and_keeps_real_date_and_venue():
    from jarvis.domains.finance.etf_reference_quote import parse_quote
    result=parse_quote(document(),ISIN,TODAY)
    assert result['quote_date']=='2026-09-11'
    assert result['spread_pct']==pytest.approx(100*.05/58.765)
    assert result['broker_execution_quote'] is False
    assert 'Tradegate' in result['quote_venue']
    assert result['quote_isin']==ISIN

@pytest.mark.parametrize('old,new',[(ISIN,'IE00WRONG4444'),('EUR','USD'),('58,74','59,00'),('11.09.2026','01.09.2026'),('11.09.2026','13.09.2026'),('22:00:00','invalid'),('id="bid"','id="other"'),('800','0')])
def test_invalid_quote_is_rejected(old,new):
    from jarvis.domains.finance.etf_reference_quote import parse_quote
    with pytest.raises(ValueError):parse_quote(document().replace(old,new),ISIN,TODAY)

def test_extreme_finite_numbers_cannot_hide_crossed_quote():
    from jarvis.domains.finance.etf_reference_quote import parse_quote
    bad=document().replace('58,74','1'+'0'*308).replace('58,79','999999'+'0'*302)
    with pytest.raises(ValueError,match='crossed'):parse_quote(bad,ISIN,TODAY)

@pytest.mark.parametrize('verified,ask,expected,failed,stamp',[(True,58.73,True,False,1789140958),(False,58.73,False,False,1789140958),(True,59.52,False,False,1789140958),(True,58.73,True,True,1789140958),(True,59.52,True,False,1787140958),(True,59.52,True,False,1791140958),(True,59.52,True,False,None)])
def test_adapter_only_uses_fallback_for_invalid_quote_and_verified_identity(monkeypatch,verified,ask,expected,failed,stamp):
    from jarvis.domains.finance import buy_evidence, etf_reference_quote
    import yfinance
    from unittest.mock import Mock
    ticker=Mock()
    ticker.history.return_value={'Close':{datetime(2026,9,11):58.9}}
    ticker.get_history_metadata.return_value={'currency':'EUR'}
    ticker.get_info.return_value={'currency':'EUR','quoteType':'ETF','bid':59.51,'ask':ask,'regularMarketTime':stamp}
    monkeypatch.setattr(yfinance,'Ticker',lambda symbol:ticker)
    monkeypatch.setattr(buy_evidence,'_broker_evidence',lambda row:{'broker_verified':verified,'isin':ISIN})
    fetch=Mock(return_value=etf_reference_quote.parse_quote(document(),ISIN,TODAY))
    if failed: fetch.side_effect=ValueError('bad reference quote')
    monkeypatch.setattr(etf_reference_quote,'fetch_reference_quote',fetch)
    result=buy_evidence._fetch_candidate({'symbol':'XNAS.DE','lane':'etf'},TODAY)
    assert fetch.called is expected
    if failed:
        assert result['spread_pct'] is None
        assert 'also unavailable' in result['quote_issue']
        assert result['isin']==ISIN
    elif expected:
        assert result['quote_date']=='2026-09-11'
        assert result['quote_isin']==ISIN
        assert result['broker_execution_quote'] is False
        assert 'crossed' in result['quote_fallback_reason']
    elif not verified:
        assert result['spread_pct'] is None
