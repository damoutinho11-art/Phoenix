from copy import deepcopy
from datetime import timedelta
import pytest

from jarvis.domains.finance.tests.test_buy_selection import candidate, TODAY
from jarvis.domains.finance.tests.test_contribution_selection import choose

DOCUMENT = '''<h3>Instrument Info</h3><dl>Instrument Type ETF Class Class 2 Equity Index ETF
Alphanumeric Code EQAC Isin Code IE00BFZXGZ54 MIC ETFP Lot Size 1.00
Total Annual Fees 0.30% Currency Denomination USD Issuer INVESCO MARKETS III</dl>'''


def evidence(document=DOCUMENT):
    from jarvis.domains.finance.fund_cost_evidence import parse_exchange_cost
    return parse_exchange_cost('EQAC.MI', document, TODAY)


def rival():
    return {**candidate(symbol='EQAC.MI'), 'broker_verified':False, 'isin':None,
            'fund_fee_pct':None, 'fund_cost_evidence':evidence()}


def test_exchange_fee_has_exact_identity_date_source_hash_and_no_broker_permission():
    row = evidence()
    assert row['isin'] == 'IE00BFZXGZ54'
    assert row['symbol'] == 'EQAC.MI'
    assert row['annual_fee_pct'] == .3
    assert row['verified_at'] == TODAY.isoformat()
    assert row['source'].startswith('https://www.borsaitaliana.it/')
    assert len(row['document_sha256']) == 64
    assert 'broker_verified' not in row


@pytest.mark.parametrize('document', [
    DOCUMENT.replace('EQAC','OTHER'), DOCUMENT.replace('IE00BFZXGZ54','IE00BK5BQT80'),
    DOCUMENT.replace('Instrument Type ETF','Instrument Type ETN'),
    DOCUMENT.replace('0.30%','NaN%'), DOCUMENT.replace('0.30%','-0.30%'),
    DOCUMENT.replace('0.30%','30%'), DOCUMENT+' Total Annual Fees 0.20%',
    '<script>'+DOCUMENT+'</script>',
])
def test_invalid_or_conflicting_exchange_document_is_rejected(document):
    with pytest.raises(ValueError): evidence(document)


def test_independent_higher_fee_excludes_rival_without_making_it_buyable():
    row = rival()
    original = deepcopy(row)
    result = choose([candidate(),row])
    assert result['lanes']['etf']['status'] == 'BUY'
    assert result['lanes']['etf']['selected']['symbol'] == 'VWCE.DE'
    alternative = result['lanes']['etf']['alternatives'][1]
    assert alternative['eligible'] is False
    assert alternative['cost_floor_exclusion']['source'] == row['fund_cost_evidence']['source']
    assert choose([row])['lanes']['etf']['status'] == 'WAIT'
    assert row == original


@pytest.mark.parametrize('mutation', ['stale','future','isin','symbol','source','hash','lower','conflict','same_class'])
def test_unusable_or_non_dominating_floor_keeps_wait(mutation):
    row = rival()
    leader = candidate()
    ev = row['fund_cost_evidence']
    if mutation == 'stale': ev['verified_at'] = (TODAY-timedelta(days=2)).isoformat()
    if mutation == 'future': ev['verified_at'] = (TODAY+timedelta(days=1)).isoformat()
    if mutation == 'isin': ev['isin'] = 'IE00BK5BQT80'
    if mutation == 'symbol': ev['symbol'] = 'OTHER.DE'
    if mutation == 'source': ev['source'] = 'https://example.com'
    if mutation == 'hash': ev['document_sha256'] = ''
    if mutation == 'lower': ev['annual_fee_pct'] = .1
    if mutation == 'conflict': row.update(isin=ev['isin'],fund_fee_pct=.1)
    if mutation == 'same_class': leader['isin'] = ev['isin']
    assert choose([leader,row])['lanes']['etf']['status'] == 'WAIT'


def test_candidate_fetch_preserves_unverified_broker_and_optional_exchange_failure():
    from unittest.mock import Mock, patch
    from jarvis.domains.finance import buy_evidence
    import pandas as pd
    ticker = Mock()
    ticker.history.return_value = pd.DataFrame({'Close':[100.]},index=pd.to_datetime(['2026-09-07']))
    ticker.get_history_metadata.return_value = {'currency':'EUR'}
    ticker.get_info.return_value = {'currency':'EUR','quoteType':'ETF'}
    broker = {'broker_verified':False,'broker_available':None,'isin':None,'fund_fee_pct':None}
    with patch('yfinance.Ticker',return_value=ticker), patch.object(buy_evidence,'_broker_evidence',return_value=broker):
        with patch.object(buy_evidence,'_public_text',return_value=DOCUMENT):
            row = buy_evidence._fetch_candidate(candidate(symbol='EQAC.MI'),TODAY)
        assert row['broker_verified'] is False
        assert row['isin'] is None
        assert row['fund_cost_evidence'] == evidence()
        with patch.object(buy_evidence,'_public_text',side_effect=OSError('unavailable')):
            missing = buy_evidence._fetch_candidate(candidate(symbol='EQAC.MI'),TODAY)
        assert missing['broker_verified'] is False
        assert 'fund_cost_evidence' not in missing


@pytest.mark.parametrize('spread', [None,.01])
@pytest.mark.parametrize('broker_fee,exchange_fee', [(.30,.10),(.10,.30)])
def test_conflicting_exchange_and_broker_fees_cannot_fall_back_or_select(spread,broker_fee,exchange_fee):
    row = rival()
    row.update(broker_verified=True,isin='IE00BFZXGZ54',fund_fee_pct=broker_fee,spread_pct=spread)
    row['fund_cost_evidence']['annual_fee_pct'] = exchange_fee
    result = choose([candidate(),row])
    assert result['lanes']['etf']['status'] == 'WAIT'
    assert 'conflicting' in result['lanes']['etf']['alternatives'][1]['reason'].lower()
