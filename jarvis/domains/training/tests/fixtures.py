# Performance in 2 days — triggers hard conflict on high-intensity Wednesday session
MOCK_OPERA_PERFORMANCE_IN_2_DAYS = {
    "as_of": "2026-06-22T09:00:00",
    "events": [{
        "event_id": "perf-001",
        "event_type": "performance",
        "title": "La Traviata",
        "date": "2026-06-24",  # Wednesday = high intensity day
        "time_start": "19:00",
        "time_end": "22:00",
        "location": "Opera House",
        "role": "Solo Bassoon",
    }],
    "fetch_warnings": [],
}

# Performance tomorrow (Tuesday) — hard block on Monday high-intensity
MOCK_OPERA_PERFORMANCE_TOMORROW = {
    "as_of": "2026-06-22T09:00:00",
    "events": [{
        "event_id": "perf-002",
        "event_type": "performance",
        "title": "Swan Lake",
        "date": "2026-06-23",  # Tuesday — day after Monday high-intensity
        "time_start": "19:00",
        "time_end": "22:00",
        "location": "Opera House",
        "role": "Solo Bassoon",
    }],
    "fetch_warnings": [],
}

# No events
MOCK_OPERA_EMPTY = {
    "as_of": "2026-06-22T09:00:00",
    "events": [],
    "fetch_warnings": [],
}

# August restart — rehearsals begin, no performances yet
MOCK_OPERA_AUGUST_REHEARSALS = {
    "as_of": "2026-08-12T09:00:00",
    "events": [
        {
            "event_id": "reh-001",
            "event_type": "rehearsal",
            "title": "Othello Rehearsal",
            "date": "2026-08-12",
            "time_start": "11:00",
            "time_end": "15:00",
            "location": "Opera House",
            "role": "Solo Bassoon",
        },
        {
            "event_id": "reh-002",
            "event_type": "rehearsal",
            "title": "Kapten Morten Rehearsal",
            "date": "2026-08-14",
            "time_start": "11:00",
            "time_end": "15:00",
            "location": "Opera House",
            "role": "Solo Bassoon",
        },
    ],
    "fetch_warnings": [],
}

# Performance on Sunday — jump day (Saturday) is day before: hard block
MOCK_OPERA_PERFORMANCE_ON_SUNDAY = {
    "as_of": "2026-06-22T09:00:00",
    "events": [{
        "event_id": "perf-003",
        "event_type": "performance",
        "title": "Rigoletto",
        "date": "2026-06-28",  # Sunday — jump Saturday is day before
        "time_start": "19:00",
        "time_end": "22:00",
        "location": "Opera House",
        "role": "Solo Bassoon",
    }],
    "fetch_warnings": [],
}
