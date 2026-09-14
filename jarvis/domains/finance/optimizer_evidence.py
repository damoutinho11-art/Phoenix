"""Instrument reconciliation and bounded public history for shadow optimization."""
from concurrent.futures import ThreadPoolExecutor, wait
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from math import isnan
from threading import Lock
from time import monotonic

from .buy_selection import _evaluate, _number
from .market_data import BROKER_ONLY_SYMBOLS, TICKER_MAP
from .lhv_nav_history import (
    NAV_HISTORY_SYMBOLS, OFFICIAL_NAV_HISTORY_INSUFFICIENT_SINCE_INCEPTION,
    OFFICIAL_NAV_HISTORY_INVALID, PUBLIC_MARKET_HISTORY_UNAVAILABLE,
    NavHistoryError, NavHistoryImmature, fetch_nav_history)
from .positions import validate_positions
from .portfolio_optimizer import VERSION, SCENARIOS, optimize_portfolio

_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='optimizer-history')
_cache, _lock = {}, Lock()
CASH_ASSETS = {'tactical_reserve', 'lhv_growth_cash_pending_settlement'}

# Broker-only share classes carry no market price series. Those with an official
# published NAV history are served by that adapter; any other has no dated price
# source at all and is classified as unsupported rather than looked up.
BROKER_ONLY_HISTORY = ('Broker-only fund share class with no official NAV history '
    'adapter. No dated public price source exists for it.')
MARKET_HISTORY_UNAVAILABLE = 'Public EUR history unavailable or request timed out.'
OFFICIAL_NAV_HISTORY_UNAVAILABLE = ('Official fund NAV history is unavailable or the '
    'request timed out.')


def reconcile_holdings(state):
    """All recorded investable EUR values count; emergency fund is separate."""
    result, provenance, seen = {'CASH': 0}, [], set()
    positions = state.get('positions', {})
    for section in ('holdings', 'legacy_holdings'):
        for asset, value in state.get(section, {}).items():
            if asset in seen:
                raise ValueError('Holding appears in both active and legacy records.')
            seen.add(asset)
            if value is None:
                raise ValueError(f'{asset}: holding value is unknown.')
            cents = round(_number(value)*100)
            if asset in positions:
                validate_positions(positions[asset])
                subtotal = sum(round(_number(p['value_eur'])*100) for p in positions[asset].values())
                if subtotal != cents:
                    raise ValueError(f'{asset}: instrument and sleeve values do not reconcile.')
                for symbol, position in positions[asset].items():
                    amount = round(position['value_eur']*100)
                    if position['units'] and not amount:
                        raise ValueError(f'{symbol}: held units lack a positive valuation.')
                    result[symbol] = result.get(symbol, 0)+amount
                    provenance.append({'asset': asset, 'symbol': symbol, 'identity_source': position.get('identity_source', 'recorded_position')})
            elif asset in CASH_ASSETS:
                result['CASH'] += cents
            elif cents:
                symbol = TICKER_MAP.get(asset)
                if not symbol:
                    raise ValueError(f'{asset}: exact held instrument is unknown.')
                result[symbol] = result.get(symbol, 0)+cents
                provenance.append({'asset': asset, 'symbol': symbol, 'identity_source': 'legacy_ticker_mapping_unconfirmed'})
    if set(positions)-seen:
        raise ValueError('Instrument positions have no corresponding sleeve valuation.')
    return result, provenance


def _research_room(asset, lane, c, p, holdings, budget):
    # Phase membership survives; target magnitude and fixed allocation caps do not.
    if _number(c['target_weights'].get(asset, 0), maximum=1) <= 0:
        raise ValueError('Outside the current investment phase.')
    route = c['asset_routes'].get(asset)
    if route != ('lhv_crypto' if lane == 'crypto' else 'lightyear'):
        raise ValueError('Configured broker route does not match the instrument.')
    if p.get('platform_status', {}).get(f'{route}_ready') is not True:
        raise ValueError('Broker route is not ready.')
    minimum = max(1, round(_number(c.get('minimum_efficient_buys', {}).get(asset, 0))*100))
    if budget < minimum:
        raise ValueError('Available contribution is below the efficient minimum buy.')
    return budget, 0, minimum, route


def eligible_candidates(rows, constitution, state, sleeve_holdings, budget, today):
    if len(rows) > 40:
        raise ValueError('Candidate limit exceeded; comparison cannot be truncated.')
    evaluated = [_evaluate(r, constitution, state, sleeve_holdings, budget, today,
        require_positive_returns=False, sizing=_research_room) for r in rows]
    groups = {}
    for row in evaluated:
        if row['eligible']:
            groups.setdefault(row.get('isin') if row['lane'] == 'etf' else row['symbol'], []).append(row)
    for group in groups.values():
        if len({r['asset'] for r in group}) > 1 or len({r.get('fund_fee_pct') for r in group}) > 1:
            for row in group:
                row.update(eligible=False, reason='Share-class identity has conflicting sleeve or fund-fee evidence.')
            continue
        best = min(group, key=lambda r: (r['one_way_cost_pct'], r['symbol']))
        for row in group:
            if row is not best:
                row.update(eligible=False, reason='Same share class represented by its lowest-cost verified venue.')
    return evaluated


def fetch_eur_history(symbol, today):
    """Five years of adjusted closes; non-EUR conversion uses same-date FX only."""
    if symbol in BROKER_ONLY_SYMBOLS:
        raise ValueError(f'{symbol}: no market data provider carries this share class.')
    import yfinance as yf
    start = (today-timedelta(days=5*366)).isoformat()
    ticker = yf.Ticker(symbol)
    frame = ticker.history(start=start, end=today.isoformat(), auto_adjust=True, timeout=8)
    currency = ticker.get_history_metadata().get('currency')
    if currency not in {'EUR', 'USD', 'GBP', 'GBp'}:
        raise ValueError(f'{symbol}: history currency is unverified or unsupported.')
    fx_symbol = {'USD': 'USDEUR=X', 'GBP': 'GBPEUR=X', 'GBp': 'GBPEUR=X'}.get(currency)
    fx = None
    if fx_symbol:
        fx_ticker = yf.Ticker(fx_symbol)
        fx_frame = fx_ticker.history(start=start, end=today.isoformat(), auto_adjust=True, timeout=8)
        if fx_ticker.get_history_metadata().get('currency') != 'EUR':
            raise ValueError('FX history must verify EUR as the quote currency.')
        fx = {i.date().isoformat(): _number(v, minimum=1e-12) for i,v in fx_frame['Close'].items() if not isnan(float(v))}
    history, omitted, missing_fx = [], 0, 0
    for index, value in frame['Close'].items():
        day = index.date().isoformat()
        if value is None or isnan(float(value)):
            omitted += 1
            continue
        if fx is not None and day not in fx:
            missing_fx += 1
            continue
        close = _number(value, minimum=1e-12) * (fx[day] if fx is not None else 1) / (100 if currency == 'GBp' else 1)
        history.append({'date': day, 'close': _number(close, minimum=1e-12)})
    return {'history': history, 'currency': 'EUR', 'original_currency': currency, 'history_supported': True,
        'fx_symbol': fx_symbol, 'symbol': symbol, 'omitted_provider_closes': omitted, 'missing_fx_dates': missing_fx,
        'source': 'Yahoo adjusted daily closes via yfinance; same-date FX',
        'retrieved_at': datetime.now(timezone.utc).isoformat()}


def fetch_histories(symbols, today):
    symbols = sorted(set(symbols)-{'CASH'})
    if len(symbols) > 60:
        raise ValueError('Instrument history limit exceeded.')
    key = (tuple(symbols), today.isoformat())
    with _lock:
        cached = _cache.get(key)
        if cached and cached[0] > monotonic():
            return deepcopy(cached[1])
        # Route each symbol to the only source that speaks for it, and never
        # spend a market-data lookup on a share class no provider carries.
        records = {s: {'history': [], 'symbol': s, 'history_supported': False,
                       'error_code': PUBLIC_MARKET_HISTORY_UNAVAILABLE,
                       'error': BROKER_ONLY_HISTORY}
                   for s in symbols
                   if s in BROKER_ONLY_SYMBOLS and s not in NAV_HISTORY_SYMBOLS}
        futures = {}
        for symbol in symbols:
            if symbol in NAV_HISTORY_SYMBOLS:
                futures[_pool.submit(fetch_nav_history, symbol, today)] = (
                    symbol, OFFICIAL_NAV_HISTORY_INVALID)
            elif symbol not in BROKER_ONLY_SYMBOLS:
                futures[_pool.submit(fetch_eur_history, symbol, today)] = (
                    symbol, PUBLIC_MARKET_HISTORY_UNAVAILABLE)
        completed, _ = wait(futures, timeout=50)
        for future, (symbol, code) in futures.items():
            try:
                if future not in completed:
                    future.cancel()
                    raise TimeoutError()
                records[symbol] = future.result()
            except Exception as exc:
                # A published series that failed validation names its own defect;
                # anything else is an unreachable source, not a data-quality claim.
                official = code == OFFICIAL_NAV_HISTORY_INVALID
                validated = official and isinstance(exc, NavHistoryError)
                record = {'history': [], 'symbol': symbol, 'history_supported': True,
                    'error_code': getattr(exc, 'code', code) if validated else code,
                    'error': (str(exc) if validated
                              else OFFICIAL_NAV_HISTORY_UNAVAILABLE if official
                              else MARKET_HISTORY_UNAVAILABLE)}
                if isinstance(exc, NavHistoryImmature):
                    record.update(expected_history_start=exc.expected_history_start,
                                  history_start_basis=exc.basis,
                                  weekly_returns=exc.weekly_returns)
                records[symbol] = record
        if len(_cache) >= 4:
            _cache.clear()
        _cache[key] = (monotonic()+1800, deepcopy(records))
        return records


def prepare_snapshot(holdings, candidates, histories, budget, today, risk_profile, provenance,
                     fixed_symbols=()):
    return deepcopy({'schema_version': 1, 'model_version': VERSION, 'as_of': today.isoformat(),
        'holdings_cents': holdings, 'candidates': candidates, 'histories': histories, 'budget_cents': budget,
        'fixed_symbols': sorted(fixed_symbols),
        'horizon_years': risk_profile.get('time_horizon_years'),
        'drawdown_tolerance_pct': risk_profile.get('max_acceptable_drawdown_pct'),
        'scenarios': [list(s) for s in SCENARIOS], 'provenance': provenance})


def snapshot_digest(snapshot):
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, allow_nan=False).encode()).hexdigest()


def replay_snapshot(snapshot):
    if snapshot['model_version'] != VERSION or snapshot['scenarios'] != [list(s) for s in SCENARIOS]:
        raise ValueError('Snapshot requires its original optimizer implementation and assumptions.')
    # Snapshots recorded before fixed sleeves existed carry none, so they replay
    # exactly as they did when they were taken.
    return optimize_portfolio(snapshot['holdings_cents'], snapshot['candidates'], snapshot['histories'],
        snapshot['budget_cents'], date.fromisoformat(snapshot['as_of']), horizon_years=snapshot['horizon_years'],
        drawdown_tolerance_pct=snapshot['drawdown_tolerance_pct'],
        fixed_symbols=snapshot.get('fixed_symbols') or ())
