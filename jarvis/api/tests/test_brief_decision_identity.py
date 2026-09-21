"""A brief must change only when the decision changes, and replaced briefs must not stay open."""
from copy import deepcopy

from jarvis.api.buy_recommendation import decision_signature


def _response():
    candidate = {
        'asset': 'growth_nasdaq_etf', 'symbol': 'XNAS.DE', 'isin': 'IE00BMFKG444', 'lane': 'etf',
        'route': 'lightyear', 'currency': 'EUR', 'fee_pct': 0, 'fund_fee_pct': 0.2,
        'research_verdict': 'WATCH', 'research_status': 'NO_EVIDENCE', 'mandate_approved': True,
        'retrieved_at': '2026-09-17T19:52:08+00:00', 'verified_at': '2026-09-17', 'quote_date': '2026-09-17',
        'spread_pct': 0.0505, 'one_way_cost_pct': 0.02525, 'comparison_cost_pct': 0.2012,
        'metrics': {'return_90_pct': -3.2, 'last_close': '2026-09-15'}, 'gap_score': 0.72,
        'room_cents': 17891, 'target_deficit_cents': 17891,
    }
    rival = {**candidate, 'symbol': 'VWCE.DE', 'isin': 'IE00BK5BQT80', 'asset': 'global_core_etf',
             'eligible': True, 'policy_eligible': True, 'reason': 'Smaller shortfall.'}
    return {'week_budget': 281.48, 'buy_selection': {
        'policy_version': 'contribution-v3', 'as_of': '2026-09-17',
        'lanes': {
            'etf': {'status': 'BUY', 'selected': candidate, 'amount_eur': 178.91,
                    'reason': 'XNAS.DE fills the largest eligible etf target shortfall (EUR 178.91).',
                    'alternatives': [rival]},
            'crypto': {'status': 'WAIT', 'selected': None, 'amount_eur': 0, 'reason': 'No review.', 'alternatives': []},
        },
        'projection': {'holdings_cents': {'btc': 15844, 'growth_nasdaq_etf': 6922}},
        'recurring_contribution': {'due_cents': 2814, 'records_sha256': 'a' * 64},
        'investment_policy': {'crypto_max_weight': 0.15},
    }}


def test_volatile_evidence_fields_do_not_change_the_decision():
    base = _response()
    later = deepcopy(base)
    lane = later['buy_selection']['lanes']['etf']
    lane['selected'].update(retrieved_at='2026-09-17T20:07:44+00:00', spread_pct=0.0611,
                            one_way_cost_pct=0.0306, comparison_cost_pct=0.2016, gap_score=0.7188,
                            metrics={'return_90_pct': -3.4, 'last_close': '2026-09-16'})
    lane['alternatives'][0].update(retrieved_at='2026-09-17T20:07:44+00:00', spread_pct=0.09)
    lane['reason'] = 'XNAS.DE fills the largest eligible etf target shortfall (EUR 178.90).'
    later['buy_selection']['projection']['holdings_cents']['btc'] = 15819
    assert decision_signature(base) == decision_signature(later)


def test_changed_choice_amount_budget_policy_or_eligibility_changes_the_decision():
    base = _response()
    signature = decision_signature(base)
    for mutate in (
        lambda r: r['buy_selection']['lanes']['etf'].update(amount_eur=169.35),
        lambda r: r['buy_selection']['lanes']['etf']['selected'].update(symbol='VWCE.DE', isin='IE00BK5BQT80'),
        lambda r: r['buy_selection']['lanes']['crypto'].update(status='BUY', amount_eur=28.14,
                                                               selected={'asset': 'btc', 'symbol': 'BTC-EUR'}),
        lambda r: r.update(week_budget=215.35),
        lambda r: r['buy_selection'].update(as_of='2026-09-18'),
        lambda r: r['buy_selection'].update(policy_version='contribution-v2'),
        lambda r: r['buy_selection']['lanes']['etf']['selected'].update(research_verdict='REJECT'),
        lambda r: r['buy_selection']['lanes']['etf']['selected'].update(fund_fee_pct=0.3),
        lambda r: r['buy_selection']['lanes']['etf']['alternatives'][0].update(eligible=False),
        lambda r: r['buy_selection']['recurring_contribution'].update(records_sha256='b' * 64),
        lambda r: r['buy_selection']['investment_policy'].update(crypto_max_weight=0.1),
    ):
        changed = deepcopy(base)
        mutate(changed)
        assert decision_signature(changed) != signature, mutate


def test_missing_selection_has_no_signature():
    assert decision_signature({'week_budget': 100}) is None


def _isolated_db(tmp_path, monkeypatch):
    from jarvis.data import database
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'briefs.db')
    database.init_db()
    return database


def _brief(database, week='W38 2026', amount=100.0):
    return database.save_brief(week_label=week, domain='finance', action='BUY', asset='btc',
                               amount_eur=amount, route='lhv_crypto', thesis='t', full_brief_json='{}')


def test_newer_decision_supersedes_older_open_briefs_only_for_that_week(tmp_path, monkeypatch):
    database = _isolated_db(tmp_path, monkeypatch)
    old, deferred, other_week = _brief(database), _brief(database), _brief(database, week='W37 2026')
    database.update_brief_status(deferred, 'deferred', 'deferred')
    rejected = _brief(database)
    database.update_brief_status(rejected, 'rejected', 'rejected')
    new = _brief(database)

    assert database.supersede_open_briefs('W38 2026', new) == 2
    statuses = {b['id']: b['status'] for b in database.get_brief_history(limit=10)}
    assert statuses[old] == statuses[deferred] == 'superseded'
    assert statuses[rejected] == 'rejected'
    assert statuses[other_week] == 'pending'
    assert statuses[new] == 'pending'
    assert database.get_pending_briefs() and {b['id'] for b in database.get_pending_briefs()} == {new, other_week}


def test_approval_supersedes_other_open_briefs_and_wins_the_week(tmp_path, monkeypatch):
    database = _isolated_db(tmp_path, monkeypatch)
    from jarvis.api.routers.finance import _brief_action
    from jarvis.api.finance_lifecycle import current_week_lifecycle
    from datetime import date
    earlier, approved, later = _brief(database), _brief(database), _brief(database)

    _brief_action(approved, 'approved', 'approved')

    statuses = {b['id']: b['status'] for b in database.get_brief_history(limit=10)}
    assert statuses == {earlier: 'superseded', approved: 'approved', later: 'superseded'}
    lifecycle = current_week_lifecycle(date(2026, 9, 18))
    assert lifecycle['latest_brief']['id'] == approved
    assert lifecycle['week_closed'] is True


def test_a_new_week_retires_open_briefs_of_earlier_weeks(tmp_path, monkeypatch):
    database = _isolated_db(tmp_path, monkeypatch)
    old_a, old_b = _brief(database, week='W38 2026'), _brief(database, week='W38 2026')
    approved = _brief(database, week='W37 2026')
    database.update_brief_status(approved, 'approved', 'approved')
    new = _brief(database, week='W39 2026')

    assert database.supersede_open_briefs_before_week('W39 2026') == 2
    statuses = {b['id']: b['status'] for b in database.get_brief_history(limit=10)}
    assert statuses[old_a] == statuses[old_b] == 'superseded'
    assert statuses[approved] == 'approved'
    assert statuses[new] == 'pending'


def test_identical_decisions_never_retire_each_other_and_a_retired_match_is_reissued(tmp_path, monkeypatch):
    database = _isolated_db(tmp_path, monkeypatch)
    import json
    from jarvis.api.buy_recommendation import brief_matches_decision
    same = json.dumps(_response())
    other = json.dumps({**_response(), 'week_budget': 100})
    a = database.save_brief(week_label='W39 2026', domain='finance', action='BUY', asset='btc', amount_eur=1, route='r', thesis='t', full_brief_json=same)
    b = database.save_brief(week_label='W39 2026', domain='finance', action='BUY', asset='btc', amount_eur=1, route='r', thesis='t', full_brief_json=same)
    c = database.save_brief(week_label='W39 2026', domain='finance', action='BUY', asset='btc', amount_eur=1, route='r', thesis='t', full_brief_json=other)
    live = _response()
    stale = [x['id'] for x in database.list_open_briefs_for_week('W39 2026') if x['id'] != b and not brief_matches_decision(x, live)]
    assert stale == [c]
    database.supersede_briefs(stale)
    statuses = {x['id']: x['status'] for x in database.get_brief_history(limit=10)}
    assert statuses[a] == 'pending' and statuses[b] == 'pending' and statuses[c] == 'superseded'
    # If every matching brief was retired by a race, the week must get a fresh open brief:
    # the persist rule re-issues whenever the newest brief is retired or no longer matches.
    database.supersede_briefs([a, b])
    latest = database.get_latest_brief_for_week('W39 2026', 'finance')
    needs_brief = not brief_matches_decision(latest, live) or latest.get('status') == 'superseded'
    assert needs_brief is True
    assert database.list_open_briefs_for_week('W39 2026') == []
