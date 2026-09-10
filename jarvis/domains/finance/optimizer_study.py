"""Conditional chronological optimizer evaluation using public prices only.

Current universe and assumed eligibility/costs are not historical broker evidence.
No production portfolio, API, orders or account data are accessed.
"""
from datetime import date, timedelta
import gzip
import hashlib
import json
from pathlib import Path

from .buy_selection import _number
from .portfolio_optimizer import VERSION, optimize_portfolio

UNIVERSE = {'etf': ['VWCE.DE','SPYI.DE','IUSQ.DE','IS3Q.DE','XNAS.DE','SXRV.DE'],
            'crypto': ['BTC-EUR','ETH-EUR','SOL-EUR']}


def study(histories, cutoffs, *, costs, contribution_cents=10000, horizon_years=20, tolerance=40):
    prices = {}
    for symbol, points in histories.items():
        series = {}
        for point in points:
            day = date.fromisoformat(point['date'])
            if day in series:
                raise ValueError('Duplicate price date in study input.')
            try:
                series[day] = _number(point['close'], minimum=1e-12)
            except (ValueError, TypeError) as exc:
                raise ValueError('Invalid price in study input.') from exc
        prices[symbol] = series
    if not {'VWCE.DE','BTC-EUR'} <= set(prices):
        raise ValueError('Both baseline instruments are required.')
    common = sorted(set.intersection(*(set(p) for p in prices.values())))
    rows = [{'symbol':s, 'asset':s.split('-')[0].lower() if s.endswith('-EUR') else 'global_core_etf',
        'lane':'crypto' if s.endswith('-EUR') else 'etf', 'eligible':True, 'minimum_cents':1,
        'one_way_cost_pct': _number(costs['crypto' if s.endswith('-EUR') else 'etf'], maximum=15)} for s in prices]
    events = {}
    for cutoff in sorted(set(cutoffs)):
        next_dates = [d for d in common if cutoff <= d <= cutoff+timedelta(days=7)]
        previous = [d for d in common if cutoff-timedelta(days=7) <= d < cutoff]
        if not next_dates or not previous:
            raise ValueError('Signal or execution prices unavailable at a study cutoff.')
        if next_dates[0] in events:
            raise ValueError('Study contributions cannot share an execution date.')
        events[next_dates[0]] = (cutoff, previous[-1])
    if not events:
        raise ValueError('No study contribution dates.')
    dates = [d for d in common if d >= min(events)]
    if any((b-a).days > 7 for a,b in zip(dates,dates[1:])):
        raise ValueError('Study valuation history has an excessive gap.')
    accounts = {name:{'units':{},'cash':0.,'fund_units':0.,'curve':[100.], 'contributions':0.,'costs':0.}
        for name in ('optimizer','broad_etf','etf80_btc20')}
    decisions = []
    def value(account, day):
        return account['cash']+sum(units*prices[s][day] for s,units in account['units'].items())
    for day in dates:
        for name, account in accounts.items():
            if day in events:
                cutoff, signal_day = events[day]
                if name == 'optimizer':
                    held = {s:round(units*prices[s][signal_day]*100) for s,units in account['units'].items()}
                    held['CASH'] = round(account['cash']*100)
                    # Physically trim the inputs before fitting, in addition to the model's cutoff gate.
                    inputs = {s:[{'date':d.isoformat(),'close':v} for d,v in p.items()
                        if cutoff-timedelta(days=5*366) <= d < cutoff] for s,p in prices.items()}
                    decision = optimize_portfolio(held,rows,inputs,contribution_cents,cutoff,
                        horizon_years=horizon_years,drawdown_tolerance_pct=tolerance)
                    trades = (decision.get('selected_plan') or {}).get('trades', [])
                    decisions.append({'signal_date':cutoff.isoformat(),'execution_date':day.isoformat(),
                        'history_end':decision.get('history_end'), 'status':decision['status'],
                        'input_holdings_cents':held, 'trades':trades,
                        'selected_weights_pct':(decision.get('selected_plan') or {}).get('weights_pct'),
                        'blockers':decision.get('blockers', [])})
                else:
                    splits = {'VWCE.DE':1.} if name == 'broad_etf' else {'VWCE.DE':.8,'BTC-EUR':.2}
                    trades = []
                    for s,fraction in splits.items():
                        outlay = round(contribution_cents*fraction)
                        fee = costs['crypto' if s.endswith('-EUR') else 'etf']/100
                        principal = int(outlay/(1+fee))
                        trades.append({'symbol':s,'cash_outlay_cents':outlay,'principal_cents':principal,
                            'estimated_cost_cents':outlay-principal})
                before_deposit = value(account, day)
                unit_price = before_deposit/account['fund_units'] if account['fund_units'] else 100.
                deposit = contribution_cents/100
                account['fund_units'] += deposit/unit_price
                account['cash'] += deposit
                account['contributions'] += deposit
                for trade in trades:
                    outlay = trade['cash_outlay_cents']/100
                    if outlay > account['cash']+1e-9:
                        raise ValueError('Study trade exceeds available cash.')
                    account['cash'] -= outlay
                    s = trade['symbol']
                    account['units'][s] = account['units'].get(s,0)+trade['principal_cents']/100/prices[s][day]
                    account['costs'] += trade['estimated_cost_cents']/100
            account['curve'].append(value(account, day)/account['fund_units'])
    summary = []
    for name, account in accounts.items():
        peak, drawdown = 100., 0.
        for unit_price in account['curve']:
            peak = max(peak,unit_price)
            drawdown = max(drawdown,1-unit_price/peak)
        growth = account['curve'][-1]/100
        elapsed = (dates[-1]-dates[0]).days
        summary.append({'strategy':name,'contributions_eur':round(account['contributions'],2),
            'ending_value_eur':round(value(account,dates[-1]),2), 'entry_costs_eur':round(account['costs'],2),
            'time_weighted_return_pct':round((growth-1)*100,6),
            'annualized_time_weighted_return_pct':round((growth**(365.25/elapsed)-1)*100,6) if elapsed >= 365 else None,
            'max_drawdown_pct':round(drawdown*100,6)})
    return {'model_version':VERSION, 'promotion_status':'NOT_VALIDATED',
        'start':dates[0].isoformat(),'end':dates[-1].isoformat(),'contribution_count':len(events),
        'assumed_one_way_cost_pct':costs,'horizon_years':horizon_years,'drawdown_tolerance_pct':tolerance,
        'summary':summary,'decisions':decisions,
        'limitations':[
            'Conditional current-universe price study; eligibility and costs are assumed, not historical broker or research evidence.',
            'Survivorship, revised adjusted prices and choice of evaluation period can bias these results.',
            'Monthly contributions; strategies retain cash and instrument units without sales or ongoing rebalancing.',
            'Daily unitized returns remove external deposits; final values are marked without liquidation costs.',
            'ETF and crypto daily closing times differ. Taxes, liquidity depth, cash interest and intra-day losses are unmodeled.',
            'Historical drawdown screening is not a future-loss guarantee; no hypothetical macro crash screen.',
            'No retrospective result alone promotes this model to live recommendations.']}


def evaluate_configuration(histories, config):
    return [study(histories,[date.fromisoformat(d) for d in config['cutoffs']], costs=costs,
        contribution_cents=config['contribution_cents'],horizon_years=config['horizon_years'],
        tolerance=config['tolerance']) for costs in config['cost_cases']]


if __name__ == '__main__':
    import argparse
    from .optimizer_evidence import fetch_eur_history
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--replay-report', type=Path, help='Replay archived prices and original study configuration without network')
    args = parser.parse_args()
    today = date.today()
    if args.replay_report:
        archived = json.loads(args.replay_report.read_text(encoding='utf-8'))
        original_bytes = gzip.decompress((args.replay_report.parent/archived['history_snapshot_file']).read_bytes())
        if hashlib.sha256(original_bytes).hexdigest() != archived['history_sha256']:
            raise ValueError('Archived public history checksum does not match.')
        histories = json.loads(original_bytes)
        config = archived['configuration']
        retrieved = archived['retrieved_as_of']
        provenance = archived.get('history_provenance', {})
    else:
        records = {s:fetch_eur_history(s,today) for s in sum(UNIVERSE.values(),[])}
        histories = {s:r['history'] for s,r in records.items()}
        provenance = {s:{k:v for k,v in r.items() if k != 'history'} for s,r in records.items()}
        retrieved = today.isoformat()
        config = {'cutoffs':[date(y,m,1).isoformat() for y in range(2024,today.year+1) for m in range(1,13)
            if date(y,m,1)+timedelta(days=32) < today], 'cost_cases':[{'etf':.05,'crypto':.5},{'etf':.25,'crypto':1.}],
            'contribution_cents':10000,'horizon_years':20,'tolerance':40}
    reports = evaluate_configuration(histories,config)
    snapshot = json.dumps(histories,sort_keys=True,allow_nan=False).encode()
    snapshot_path = args.output.with_suffix('.prices.json.gz')
    snapshot_path.write_bytes(gzip.compress(snapshot,mtime=0))
    report = {'retrieved_as_of':retrieved,'configuration':config,'history_provenance':provenance,
        'history_source':'Yahoo adjusted daily EUR closes via yfinance',
        'history_snapshot_file':snapshot_path.name,'history_sha256':hashlib.sha256(snapshot).hexdigest(),'studies':reports}
    args.output.write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'report':str(args.output),'summaries':[r['summary'] for r in reports]},indent=2))
