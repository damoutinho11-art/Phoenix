"""Separately versioned, diagnostic-only stress comparisons. No allocations."""
from copy import deepcopy
from datetime import date, timedelta
from math import isfinite

from .buy_selection import _number

VERSION = 'downside-review-v1'
ASSET_CLASSES = {**{a:'crypto' for a in ('btc','eth','sol','hype','tao')},
    **{a:'equity' for a in ('global_core_etf','growth_nasdaq_etf','quality_etf',
        'lhv_growth_sxr8','lhv_growth_iemm','lhv_growth_xcha','lhv_growth_world_equities')},
    'lhv_growth_euro_bond':'bond'}


def downside_config(snapshot):
    classes, conflicts = {}, set()
    rows = list(snapshot.get('candidates', []))+snapshot.get('provenance', {}).get('identities', [])
    for row in rows:
        symbol, asset_class = row.get('symbol'), ASSET_CLASSES.get(row.get('asset'))
        if not symbol or not asset_class:
            continue
        if symbol in classes and classes[symbol] != asset_class:
            conflicts.add(symbol)
        classes[symbol] = asset_class
    for symbol in conflicts:
        del classes[symbol]
    return {'version':VERSION,'asset_classes':classes,
        'classification_basis':'Configured portfolio sleeves; asset-class assumptions, not issuer-level holdings look-through.',
        'scenarios':[
            {'id':'broad_selloff','label':'Illustrative broad selloff','kind':'hypothetical',
             'shocks_pct':{'equity':-40,'crypto':-70,'bond':-15,'cash':0}},
            {'id':'crypto_shock','label':'Illustrative crypto shock','kind':'hypothetical',
             'shocks_pct':{'equity':-10,'crypto':-80,'bond':0,'cash':0}},
            {'id':'correlated_shock','label':'All investments fall 30%','kind':'hypothetical',
             'shocks_pct':{'noncash':-30,'cash':0}},
            {'id':'historical_2022','label':'Observed 2022 window','kind':'historical_window',
             'start':'2022-01-03','end':'2022-10-12'}]}


def _whole(value):
    number = _number(value)
    if int(number) != value:
        raise ValueError('Portfolio amounts must use nonnegative whole cents.')
    return int(number)


def _project(snapshot, plan):
    holdings = {s:_whole(v) for s,v in snapshot['holdings_cents'].items()}
    budget = _whole(snapshot['budget_cents'])
    spent = cost = 0
    for trade in plan['trades']:
        outlay, principal, fee = (_whole(trade[k]) for k in
            ('cash_outlay_cents','principal_cents','estimated_cost_cents'))
        if outlay != principal+fee or trade['symbol']=='CASH':
            raise ValueError('Trade identity, principal and costs do not reconcile.')
        spent += outlay
        cost += fee
        holdings[trade['symbol']] = holdings.get(trade['symbol'],0)+principal
    unspent = _whole(plan['unspent_contribution_cents'])
    if spent+unspent != budget or cost != _whole(plan['estimated_cost_cents']):
        raise ValueError('Plan does not reconcile to its contribution and estimated costs.')
    holdings['CASH'] = holdings.get('CASH',0)+unspent
    if sum(holdings.values()) != _whole(plan['net_value_cents']):
        raise ValueError('Projected instrument values do not reconcile to the plan.')
    return holdings,cost


def _historical_shocks(snapshot, scenario, symbols):
    start,end = date.fromisoformat(scenario['start']),date.fromisoformat(scenario['end'])
    as_of = date.fromisoformat(snapshot['as_of'])
    if end >= as_of or start >= end:
        raise ValueError('Historical scenario must be completed before the decision date.')
    series = {}
    for symbol in symbols:
        points, seen = {}, set()
        for point in snapshot.get('histories', {}).get(symbol, []):
            day = date.fromisoformat(point['date'])
            if not start <= day <= end:
                continue
            if day in seen:
                raise ValueError(f'{symbol}: duplicate historical date.')
            seen.add(day)
            if point.get('close') is not None:
                points[day] = _number(point['close'],minimum=1e-12)
        if not points:
            raise ValueError(f'{symbol}: historical scenario coverage is missing.')
        series[symbol] = points
    if not symbols:
        return {},{}
    common = sorted(set.intersection(*(set(p) for p in series.values())))
    if len(common)<2 or common[0]>start+timedelta(days=7) or common[-1]<end-timedelta(days=7):
        raise ValueError('Common observed prices near both historical endpoints are required.')
    shocks = {s:(p[common[-1]]/p[common[0]]-1)*100 for s,p in series.items()}
    if any(not isfinite(v) for v in shocks.values()):
        raise ValueError('Historical scenario produced invalid returns.')
    return shocks,{'observed_start':common[0].isoformat(),'observed_end':common[-1].isoformat()}


def _historical_context(snapshot, scenario, symbols):
    covered, unavailable = [], {}
    for symbol in symbols:
        try:
            _historical_shocks(snapshot,scenario,[symbol])
            covered.append(symbol)
        except (ValueError,KeyError,TypeError,OverflowError) as exc:
            unavailable[symbol] = str(exc)
    try:
        shocks,observed = _historical_shocks(snapshot,scenario,covered)
        return {'shocks':shocks,'observed':observed,'unavailable':unavailable}
    except (ValueError,KeyError,TypeError,OverflowError) as exc:
        return {'reason':str(exc)}


def _scenario_result(snapshot, config, scenario, holdings, cost, gross, tolerance, historical=None):
    output = {k:deepcopy(v) for k,v in scenario.items()}
    output.update(status='INCOMPLETE',loss_including_entry_cost_cents=None,
        loss_pct_of_starting_wealth=None,exceeds_tolerance=None)
    try:
        shocks = {}
        if scenario['kind']=='historical_window':
            if 'reason' in historical:
                raise ValueError(historical['reason'])
            missing = [s for s,v in holdings.items() if s!='CASH' and v and s not in historical['shocks']]
            if missing:
                raise ValueError('Historical scenario unavailable: '+', '.join(missing)+'.')
            shocks = dict(historical['shocks'])
            output.update(historical['observed'])
            shocks['CASH'] = 0
        elif scenario['kind']=='hypothetical':
            configured = {k:_number(v,minimum=-100,maximum=100) for k,v in scenario['shocks_pct'].items()}
            for symbol,value in holdings.items():
                if not value:
                    continue
                asset_class = ('cash' if symbol=='CASH' else 'noncash' if 'noncash' in configured
                    else config['asset_classes'].get(symbol))
                if asset_class not in configured:
                    raise ValueError(f'{symbol}: no supported asset-class shock mapping.')
                shocks[symbol] = configured[asset_class]
        else:
            raise ValueError('Unknown stress scenario type.')
        contributions = {s:round(v*shocks[s]/100) for s,v in holdings.items() if v}
        pnl = sum(contributions.values())
        loss = max(0,cost-pnl)
        output.update(status='CALCULATED',shock_pnl_cents=pnl,
            loss_including_entry_cost_cents=loss,loss_pct_of_starting_wealth=round(loss/gross*100,6),
            remaining_value_cents=sum(holdings.values())+pnl,
            exceeds_tolerance=loss/gross*100>tolerance,
            instrument_shock_pnl_cents=contributions)
    except (ValueError,KeyError,TypeError,OverflowError) as exc:
        output['reason'] = str(exc)
    return output


def compare_downside(snapshot, result):
    config = snapshot['downside_configuration']
    if config['version'] != VERSION or not 1 <= len(config['scenarios']) <= 10:
        raise ValueError('Unsupported downside configuration.')
    tolerance = _number(snapshot['drawdown_tolerance_pct'],minimum=1,maximum=99)
    gross = sum(_whole(v) for v in snapshot['holdings_cents'].values())+_whole(snapshot['budget_cents'])
    if gross <= 0:
        raise ValueError('No portfolio wealth available for stress comparison.')
    plans = []
    if result.get('selected_plan') is not None:
        plans.append(('selected','Research choice',result['selected_plan']))
    cash_plan = {'trades':[],'estimated_cost_cents':0,'net_value_cents':gross,
        'unspent_contribution_cents':snapshot['budget_cents']}
    plans.append(('cash_contribution','Keep new contribution in cash',cash_plan))
    seen = {tuple(sorted((t['symbol'],t['cash_outlay_cents']) for t in p['trades'])) for _,_,p in plans}
    for rank,plan in enumerate(result.get('ranked_plans',[])[:5],1):
        key = tuple(sorted((t['symbol'],t['cash_outlay_cents']) for t in plan['trades']))
        if key not in seen:
            plans.append((f'alternative_{rank}',f'Research alternative {rank}',plan))
            seen.add(key)
    projected = [(*p,*_project(snapshot,p[2])) for p in plans]
    symbols = sorted({s for _,_,_,h,_ in projected for s,v in h.items() if s!='CASH' and v})
    historical = {s['id']:_historical_context(snapshot,s,symbols) for s in config['scenarios'] if s['kind']=='historical_window'}
    comparison = []
    for identity,label,plan,holdings,cost in projected:
        scenarios = [_scenario_result(snapshot,config,s,holdings,cost,gross,tolerance,historical.get(s['id'])) for s in config['scenarios']]
        comparison.append({'id':identity,'label':label,'trades':deepcopy(plan['trades']),
            'cash_after_contribution_cents':holdings.get('CASH',0),
            'cash_weight_pct':round(holdings.get('CASH',0)/sum(holdings.values())*100,6),
            'estimated_entry_cost_cents':cost,'scenarios':scenarios})
    return {'version':VERSION,'as_of':snapshot['as_of'],'classification_basis':config['classification_basis'],
        'historical_windows':{key:value.get('observed',{'reason':value.get('reason')}) for key,value in historical.items()},
        'drawdown_tolerance_reference_pct':tolerance,'plans':comparison,
        'limitations':[
            'Diagnostic scenarios only: not forecasts, probabilities, maximum-loss estimates or new allocation limits.',
            'Losses include estimated entry costs and use portfolio wealth before those costs as the denominator.',
            'The historical window measures endpoint loss, not maximum drawdown within the window.',
            'All comparable plans use one pair of common observed historical endpoints; unsupported exposures make their plan incomplete.',
            'Asset classes are configured sleeve assumptions; issuer overlap and currency-factor exposures are not modeled.',
            'Existing recorded cash is held constant by the contribution allocator; this comparison does not authorize deploying it.',
            'Missing scenarios remain incomplete. Taxes, executable liquidity, cash interest and selling costs are unmodeled.']}
