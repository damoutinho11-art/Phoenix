"""Offline dated-snapshot replay; no network, account data or trading effects.

Run: python -m jarvis.domains.finance.buy_replay snapshots.json
Snapshots must contain evidence known on their as_of date. Historical prices
alone cannot reconstruct past broker availability, fees or research verdicts.
"""
import argparse
from datetime import date, timedelta
import json
from math import isfinite
from pathlib import Path

from .buy_selection import select_buys


def capture_snapshot(candidates, constitution, portfolio_state, holdings, budget,
                     as_of, policy_version, horizon_years):
    """Capture decision inputs, not unrelated account/profile information."""
    def clean(value):
        if isinstance(value, float) and not isfinite(value):
            # float() restores these JSON-safe sentinels during evidence checks.
            # Infinity is invalid evidence; it must never become an omittable gap.
            return str(value)
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value
    return clean({'as_of': as_of.isoformat(), 'policy_version': policy_version,
                  'implementation_version': 'portfolio-foundation-v1',
                  'horizon_years': horizon_years, 'candidates': candidates,
                  'constitution': constitution, 'holdings_cents': holdings,
                  'weekly_budget_cents': budget,
                  'portfolio_state': {'platform_status': portfolio_state.get('platform_status', {})}})


def _outcome(row, raw_rows, start, horizon):
    if not row:
        return {'symbol': None, 'net_return_pct': 0.0, 'status': 'CASH'}
    raw = next(r for r in raw_rows if r['symbol'] == row['symbol'] and r['asset'] == row['asset'])
    prices = []
    for point in raw.get('history', []):
        try:
            day, value = date.fromisoformat(point['date']), float(point['close'])
            if day >= start and isfinite(value) and value > 0:
                prices.append((day, value))
        except (ValueError, TypeError, KeyError):
            continue
    prices.sort()
    limit = 2 if row['lane'] == 'crypto' else 7
    entries = [p for p in prices if p[0] <= start + timedelta(days=limit)]
    end = start + timedelta(days=horizon)
    exits = [p for p in prices if end <= p[0] <= end + timedelta(days=limit)]
    result = {'symbol': row['symbol'], 'net_return_pct': None, 'status': 'MISSING_FORWARD_PRICES'}
    if entries and exits:
        cost = row['one_way_cost_pct'] / 100
        net = (exits[0][1] / entries[0][1]) * (1 - cost) / (1 + cost) - 1
        result.update(net_return_pct=round(net * 100, 6), status='HYPOTHETICAL',
                      entry_date=entries[0][0].isoformat(), exit_date=exits[0][0].isoformat())
    return result


def replay_snapshots(snapshots, horizon_days=30):
    if not isinstance(horizon_days, int) or horizon_days < 8:
        raise ValueError('Use a forward horizon of at least eight days.')
    decisions, outcomes = [], []
    for snapshot in snapshots:
        today = date.fromisoformat(snapshot['as_of'])
        rows = snapshot['candidates']
        policy = snapshot.get('policy_version', 'evidence-buy-v1')
        if policy == 'contribution-v2':
            from .contribution_selection import select_contributions
            result = select_contributions(rows, snapshot['constitution'], snapshot['portfolio_state'],
                snapshot['holdings_cents'], snapshot['weekly_budget_cents'], today,
                horizon_years=snapshot.get('horizon_years'))
        elif policy == 'evidence-buy-v1':
            result = select_buys(rows, snapshot['constitution'], snapshot['portfolio_state'],
                                 snapshot['holdings_cents'], snapshot['weekly_budget_cents'], today)
        else:
            raise ValueError('Unknown archived selection policy.')
        decisions.append(result)
        for lane, decision in result['lanes'].items():
            eligible = [r for r in result['candidates'] if r.get('lane') == lane and r['eligible']]
            # Deterministic target-gap baseline with a disclosed symbol tie-break.
            gap = min(eligible, key=lambda r: (-r['gap_score'], r['symbol'])) if eligible else None
            outcomes.append({'as_of': today.isoformat(), 'lane': lane,
                'selected': _outcome(decision['selected'], rows, today, horizon_days),
                'target_gap': _outcome(gap, rows, today, horizon_days), 'cash_return_pct': 0.0})
    return {'decisions': decisions, 'outcomes': outcomes, 'horizon_days': horizon_days,
            'limitations': ['Snapshot evidence must be point-in-time; current metadata must not be backdated.',
                'Per-purchase hypothetical returns, not a compounded portfolio backtest.',
                'Assumes next available daily close execution, symmetric recorded costs, and zero cash interest.',
                'Taxes, slippage, market impact, survivorship and data revisions are not modeled.',
                'Synthetic fixtures validate behavior only; they do not establish investment performance.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshots', type=Path)
    args = parser.parse_args()
    print(json.dumps(replay_snapshots(json.loads(args.snapshots.read_text(encoding='utf-8'))),
                     indent=2, allow_nan=False))
