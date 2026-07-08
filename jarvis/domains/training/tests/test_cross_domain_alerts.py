import json
import unittest
from datetime import date
from pathlib import Path

_TRAINING_CONST_PATH = Path(__file__).parent.parent / "constitution.json"
_NUTRITION_CONST_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "domains"
    / "nutrition"
    / "constitution.json"
)

with open(_TRAINING_CONST_PATH) as f:
    TRAINING_CONSTITUTION = json.load(f)

with open(_NUTRITION_CONST_PATH) as f:
    NUTRITION_CONSTITUTION = json.load(f)

# Performance tomorrow triggers hard conflict
MOCK_PERFORMANCE_TOMORROW = {
    "as_of": "2026-06-22T09:00:00",
    "events": [{
        "event_id": "perf-001",
        "event_type": "performance",
        "title": "La Traviata",
        "date": "2026-06-23",
        "time_start": "19:00",
        "time_end": "22:00",
        "location": "Opera House",
        "role": "Solo Bassoon",
    }],
    "fetch_warnings": [],
}

MOCK_EMPTY_OPERA = {
    "as_of": "2026-06-22T09:00:00",
    "events": [],
    "fetch_warnings": [],
}


class CrossDomainAlertTests(unittest.TestCase):
    def _run(self, opera=None, today=None):
        from jarvis.domains.training.engine import get_cross_domain_alerts

        return get_cross_domain_alerts(
            training_constitution=TRAINING_CONSTITUTION,
            nutrition_constitution=NUTRITION_CONSTITUTION,
            opera_snapshot_raw=opera or MOCK_EMPTY_OPERA,
            today=today or date(2026, 6, 22),
        )

    def test_returns_list(self):
        result = self._run()
        assert isinstance(result, list)

    def test_always_includes_dunk_countdown(self):
        result = self._run()
        assert any("days to attempt" in alert for alert in result)

    def test_always_includes_cut_status(self):
        result = self._run()
        assert any("Cut active" in alert for alert in result)

    def test_hard_conflict_detected_when_performance_tomorrow(self):
        result = self._run(opera=MOCK_PERFORMANCE_TOMORROW)
        assert any("CONFLICT" in alert for alert in result)

    def test_no_conflict_when_no_opera_events(self):
        result = self._run(opera=MOCK_EMPTY_OPERA)
        assert not any("CONFLICT" in alert for alert in result)

    def test_no_conflict_when_opera_none(self):
        result = self._run(opera=None)
        assert not any("CONFLICT" in alert for alert in result)

    def test_peak_warning_near_peak_week(self):
        # 5 days before peak week starts (Aug 31)
        near_peak = date(2026, 8, 26)
        result = self._run(today=near_peak)
        assert any("Peak week" in alert for alert in result)

    def test_no_peak_warning_far_from_peak(self):
        result = self._run(today=date(2026, 6, 22))
        assert not any("Peak week" in alert for alert in result)

    def test_never_raises_on_bad_input(self):
        from jarvis.domains.training.engine import get_cross_domain_alerts

        result = get_cross_domain_alerts(
            training_constitution={},
            nutrition_constitution={},
            opera_snapshot_raw=None,
            today=date(2026, 6, 22),
        )
        assert isinstance(result, list)


class CrossDomainRouteTests(unittest.TestCase):
    def test_alerts_route_returns_200(self):
        from fastapi.testclient import TestClient
        from jarvis.api.main import app

        client = TestClient(app)
        response = client.get("/cross-domain/alerts")
        assert response.status_code == 200

    def test_alerts_route_shape(self):
        from fastapi.testclient import TestClient
        from jarvis.api.main import app

        client = TestClient(app)
        data = client.get("/cross-domain/alerts").json()
        assert "alerts" in data
        assert "count" in data
        assert isinstance(data["alerts"], list)

    def test_count_matches_alerts_length(self):
        from fastapi.testclient import TestClient
        from jarvis.api.main import app

        client = TestClient(app)
        data = client.get("/cross-domain/alerts").json()
        assert data["count"] == len(data["alerts"])
