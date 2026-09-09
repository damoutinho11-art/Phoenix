"""Conditional price-only study; not a replay of historical buy approvals.

Current fund universe, equal target gaps and assumed costs are explicit study
assumptions. Broker availability and research are NOT backdated or simulated.
No portfolio data is read. No trades or production API requests are made.
"""
from datetime import date, timedelta
import gzip
import hashlib
import json
from math import isfinite
from pathlib import Path
from statistics import mean

from .buy_selection import _scores, measure_history

UNIVERSE = {'etf': ['VWCE.DE', 'SPYI.DE', 'IUSQ.DE', 'IS3Q.DE', 'XNAS.DE', 'SXRV.DE'],
            'crypto': ['BTC-EUR', 'ETH-EUR', 'SOL-EUR']}


def study(histories, cutoffs, costs):
    records = []
    for lane, symbols in UNIVERSE.items():
        for cost_pct in costs[lane]:
            for cutoff in cutoffs:
                rows, forward = [], {}
                for symbol in symbols:
                    points = histories[symbol]
                    try:
                        metrics = measure_history(points, cutoff, lane)
                    except ValueError:
                        break
                    rows.append({'symbol': symbol, 'metrics': metrics, 'gap_score': 1})
                    prices = sorted((date.fromisoformat(p['date']), p['close']) for p in points
                                    if p['close'] is not None and isfinite(p['close']) and p['close'] > 0)
                    entries = [p for p in prices if cutoff <= p[0] <= cutoff + timedelta(days=7)]
                    exits = [p for p in prices if cutoff + timedelta(days=30) <= p[0] <= cutoff + timedelta(days=37)]
                    if not entries or not exits:
                        break
                    one_way = cost_pct / 200
                    forward[symbol] = 100 * ((exits[0][1] / entries[0][1]) * (1-one_way)/(1+one_way) - 1)
                if len(forward) != len(symbols):
                    continue
                eligible = [r for r in rows if min(r['metrics']['return_90_pct'], r['metrics']['return_180_pct']) > cost_pct]
                _scores(eligible)
                selected = None
                if eligible:
                    top = max(r['score'] for r in eligible)
                    risk_top = max(r['risk_weighted_score'] for r in eligible)
                    leaders = [r for r in eligible if r['score'] == top]
                    risk_leaders = [r for r in eligible if r['risk_weighted_score'] == risk_top]
                    if len(leaders) == len(risk_leaders) == 1 and leaders[0] is risk_leaders[0]:
                        selected = leaders[0]['symbol']
                records.append({'lane': lane, 'assumed_round_trip_cost_pct': cost_pct,
                    'cutoff': cutoff.isoformat(), 'selected': selected,
                    'policy_return_pct': forward[selected] if selected else 0,
                    'equal_weight_return_pct': mean(forward.values())})
    summary = []
    for lane in UNIVERSE:
        for cost in costs[lane]:
            rows = [r for r in records if r['lane'] == lane and r['assumed_round_trip_cost_pct'] == cost]
            if rows:
                summary.append({'lane': lane, 'assumed_round_trip_cost_pct': cost, 'windows': len(rows),
                    'wait_windows': sum(r['selected'] is None for r in rows),
                    'mean_policy_return_pct': round(mean(r['policy_return_pct'] for r in rows), 4),
                    'mean_equal_weight_return_pct': round(mean(r['equal_weight_return_pct'] for r in rows), 4),
                    'outperformed_windows': sum(r['policy_return_pct'] > r['equal_weight_return_pct'] for r in rows)})
    return {'summary': summary, 'windows': records,
        'limitations': ['Conditional price-only study, not historical broker/research eligibility or actual portfolio performance.',
          'Universe chosen today; survivorship and revised adjusted-history biases remain.',
          'Equal target gaps isolate price/risk ranking; personal holdings and sizing are not modeled.',
          'Costs are assumptions, not reconstructed historical quotes. Taxes and slippage are not modeled.',
          '30-day windows overlap near short months; observations are not independent.',
          'WAIT earns zero; outcomes are per-purchase returns, not compounded wealth.',
          'HYPE and TAO are excluded from this long-period comparison because comparable dated history was not collected.']}


if __name__ == '__main__':
    import argparse
    import yfinance as yf
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    today = date.today()
    histories = {}
    for symbol in sum(UNIVERSE.values(), []):
        ticker = yf.Ticker(symbol)
        frame = ticker.history(start='2023-01-01', end=today.isoformat(), auto_adjust=True, timeout=8)
        if ticker.get_history_metadata().get('currency') != 'EUR':
            raise ValueError(f'{symbol}: EUR history unverified')
        histories[symbol] = [{'date': index.date().isoformat(), 'close': float(value) if isfinite(float(value)) else None}
                             for index, value in frame['Close'].items()]
    cutoffs = [date(y, m, 1) for y in range(2024, today.year + 1) for m in range(1, 13)
               if date(y, m, 1) + timedelta(days=37) < today]
    report = study(histories, cutoffs, {'etf': [.1, .5], 'crypto': [1, 2]})
    snapshot = json.dumps(histories, sort_keys=True, allow_nan=False).encode('utf-8')
    snapshot_path = args.output.with_suffix('.prices.json.gz')
    snapshot_path.write_bytes(gzip.compress(snapshot, mtime=0))
    report.update(retrieved_as_of=today.isoformat(), history_source='Yahoo adjusted daily EUR history via yfinance',
                  history_snapshot_file=snapshot_path.name, history_sha256=hashlib.sha256(snapshot).hexdigest())
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps(report['summary'], indent=2))
