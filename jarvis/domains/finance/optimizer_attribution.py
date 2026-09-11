"""Ex-post accounting attribution of an archived synthetic contribution study.

This explains known results; it is not a forecast, causal identification or new
out-of-sample validation. No allocator parameters are changed or refitted.
"""
from collections import defaultdict
from datetime import date
from math import isfinite

from .buy_selection import _number

VERSION = 'contribution-attribution-v1'


def _cents(value):
    number = _number(value)
    if int(number) != value:
        raise ValueError('Amounts must be nonnegative whole cents.')
    return int(number)


def attribute_study(study, histories, contribution_cents, benchmark='VWCE.DE'):
    budget = _cents(contribution_cents)
    if budget <= 0:
        raise ValueError('A positive contribution is required.')
    prices = {}
    for symbol, points in histories.items():
        series = {}
        for point in points:
            day = date.fromisoformat(point['date'])
            if day in series:
                raise ValueError('Duplicate historical price date.')
            try:
                series[day] = _number(point['close'], minimum=1e-12)
            except (ValueError,TypeError) as exc:
                raise ValueError('Invalid historical price.') from exc
        prices[symbol] = series
    decisions = study['decisions']
    if not decisions or len(decisions) != study['contribution_count']:
        raise ValueError('Study contribution count does not reconcile.')
    if sum(_cents(v) for v in decisions[0]['input_holdings_cents'].values()) != 0:
        raise ValueError('This decomposition requires the study to start without existing holdings.')
    end = date.fromisoformat(study['end'])
    fee_rate = _number(study['assumed_one_way_cost_pct']['etf'], maximum=15)/100
    benchmark_principal = int(budget/(1+fee_rate))
    benchmark_fee = budget-benchmark_principal
    cash_effect = selection_effect = fee_effect = ending_cash = final_assets = benchmark_final = entry_costs = 0.
    instrument_totals = defaultdict(lambda: {'cash_outlay_cents':0,'principal_cents':0,
        'entry_cost_cents':0,'ending_value_cents':0.,'selection_effect_cents':0.})
    records, previous = [], None
    def growth(symbol, day):
        try:
            multiple = prices[symbol][end]/prices[symbol][day]
        except KeyError as exc:
            raise ValueError(f'{symbol}: exact execution/end price is missing.') from exc
        if not isfinite(multiple):
            raise ValueError('Invalid outcome multiple.')
        return multiple
    for decision in decisions:
        day = date.fromisoformat(decision['execution_date'])
        if day > end or (previous is not None and day <= previous):
            raise ValueError('Contribution dates must be unique, ordered and no later than the end date.')
        previous = day
        benchmark_growth = growth(benchmark,day)
        spent = 0
        current_selection = 0.
        current_fee = benchmark_fee*benchmark_growth
        for trade in decision['trades']:
            outlay, principal, fee = (_cents(trade[k]) for k in
                ('cash_outlay_cents','principal_cents','estimated_cost_cents'))
            if principal+fee != outlay:
                raise ValueError('Trade outlay, principal and fee do not reconcile.')
            symbol = trade['symbol']
            multiple = growth(symbol,day)
            effect = outlay*(multiple-benchmark_growth)
            ending = principal*multiple
            spent += outlay
            entry_costs += fee
            final_assets += ending
            current_selection += effect
            current_fee -= fee*multiple
            totals = instrument_totals[symbol]
            for key,value in [('cash_outlay_cents',outlay),('principal_cents',principal),
                ('entry_cost_cents',fee),('ending_value_cents',ending),('selection_effect_cents',effect)]:
                totals[key] += value
        if spent > budget:
            raise ValueError('Study outlay exceeds the new contribution.')
        unspent = budget-spent
        current_cash = unspent*(1-benchmark_growth)
        ending_cash += unspent
        cash_effect += current_cash
        selection_effect += current_selection
        fee_effect += current_fee
        benchmark_final += benchmark_principal*benchmark_growth
        records.append({'execution_date':day.isoformat(),'unspent_contribution_eur':unspent/100,
            'cash_timing_effect_eur':round(current_cash/100,6),
            'instrument_selection_effect_eur':round(current_selection/100,6),
            'fee_difference_effect_eur':round(current_fee/100,6)})
    final = final_assets+ending_cash
    gap = final-benchmark_final
    if not all(isfinite(v) for v in (final,gap,cash_effect,selection_effect,fee_effect)):
        raise ValueError('Nonfinite attribution result.')
    if abs(gap-cash_effect-selection_effect-fee_effect) > .0001:
        raise ValueError('Attribution effects do not reconcile to the ending-value gap.')
    summaries = {s['strategy']:s for s in study['summary']}
    for name,total in [('optimizer',final),('broad_etf',benchmark_final)]:
        if abs(round(total/100,2)-_number(summaries[name]['ending_value_eur'])) > .005:
            raise ValueError('Reconstructed result does not match the archived study.')
    return {'version':VERSION,'benchmark':benchmark,'contribution_count':len(decisions),
        'contributions_eur':budget*len(decisions)/100,'ending_cash_eur':ending_cash/100,
        'ending_value_eur':round(final/100,2),'benchmark_ending_value_eur':round(benchmark_final/100,2),
        'ending_value_gap_eur':round(gap/100,6),'entry_costs_eur':entry_costs/100,
        'cash_timing_effect_eur':round(cash_effect/100,6),
        'instrument_selection_effect_eur':round(selection_effect/100,6),
        'fee_difference_effect_eur':round(fee_effect/100,6),
        'instruments':{s:{k.replace('_cents','_eur'):round(v/100,6) for k,v in totals.items()}
            for s,totals in instrument_totals.items()},'contributions':records,
        'interpretation':'Exact ex-post ending-wealth decomposition against the same dated broad-ETF contributions. Positive effects helped; negative effects hurt.',
        'limitations':[
            'Development-period diagnosis, not fresh validation or evidence of future outperformance.',
            'Cash timing assumes the unspent contribution could instead have bought the benchmark on its original contribution date.',
            'Instrument selection uses outlays before fees; fee differences include the subsequent growth or loss of the foregone units.',
            'Effects decompose ending EUR wealth, not annualized or time-weighted return percentages.',
            'The study earns zero interest on cash. Taxes and executable historical quotes are not modeled.']}


if __name__ == '__main__':
    import argparse
    import gzip
    import hashlib
    import json
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding='utf-8'))
    raw = gzip.decompress((args.report.parent/report['history_snapshot_file']).read_bytes())
    if hashlib.sha256(raw).hexdigest() != report['history_sha256']:
        raise ValueError('Public history checksum does not match.')
    histories = json.loads(raw)
    results = [attribute_study(s,histories,report['configuration']['contribution_cents']) for s in report['studies']]
    output = {'source_report':args.report.name,'source_history_sha256':report['history_sha256'],
        'source_report_sha256':hashlib.sha256(args.report.read_bytes()).hexdigest(),'results':results}
    args.output.write_text(json.dumps(output,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps([{k:v for k,v in r.items() if k not in ('contributions','instruments','limitations')} for r in results],indent=2))
