"""Exercise the real app with database startup and external OAuth replaced."""
import hashlib
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

KEY = 'synthetic-integration-key'
DIGEST = hashlib.sha256(KEY.encode()).hexdigest()


class AppAccessControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = tempfile.TemporaryDirectory(prefix='phoenix-access-test-')
        cls.env = patch.dict(os.environ, {
            'JARVIS_DB_PATH': cls.runtime.name + '/synthetic.db',
            'PHOENIX_PORTFOLIO_STATE_PATH': cls.runtime.name + '/absent.json',
            'PHOENIX_BACKGROUND_JOBS_ENABLED': 'false',
            'PHOENIX_ACCESS_KEY_SHA256': DIGEST,
            'PHOENIX_ALLOWED_ORIGINS': 'https://owner.example',
        }, clear=True)
        cls.env.start()
        cls.dotenv = patch('dotenv.load_dotenv', return_value=False)
        cls.dotenv.start()
        cls.database = patch('jarvis.data.database.init_db')
        cls.database.start()
        from jarvis.api.main import app
        cls.app = app
        cls.client = TestClient(app, follow_redirects=False)

    @classmethod
    def tearDownClass(cls):
        cls.database.stop()
        cls.dotenv.stop()
        cls.env.stop()
        cls.runtime.cleanup()

    def test_real_routes_reject_before_database_access(self):
        with patch('jarvis.data.database.get_db', side_effect=AssertionError('Database accessed')):
            for route in self.app.routes:
                if route.path == '/health':
                    continue
                for method in getattr(route, 'methods', set()):
                    response = self.client.request(method, route.path)
                    self.assertEqual(response.status_code, 401, (method, route.path))
                    self.assertIn('no-store', response.headers['cache-control'])

    def test_health_probe_and_configuration_failure(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        headers = {'Authorization': f'Bearer {KEY}'}
        response = self.client.get('/access/check', headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'authenticated': True})
        with patch.dict(os.environ, {'PHOENIX_ACCESS_KEY_SHA256': ''}):
            self.assertEqual(self.client.get('/access/check', headers=headers).status_code, 503)
            self.assertEqual(self.client.get('/health').status_code, 200)

    def test_real_cors_preflight_and_denial(self):
        headers = {'Origin': 'https://owner.example', 'Access-Control-Request-Method': 'GET',
                   'Access-Control-Request-Headers': 'Authorization'}
        self.assertEqual(self.client.options('/access/check', headers=headers).status_code, 200)
        response = self.client.get('/access/check', headers={'Origin': 'https://owner.example'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers['access-control-allow-origin'], 'https://owner.example')

    def test_real_oauth_start_callback_and_replay(self):
        from jarvis.api.routers import google_auth
        google_auth._pending_states.clear()
        with patch.object(google_auth.google_oauth, 'is_configured', return_value=True), \
             patch.object(google_auth.google_oauth, 'generate_state_token', return_value='synthetic-state'), \
             patch.object(google_auth.google_oauth, 'build_authorization_url', return_value=('https://accounts.google.com/synthetic', 'verifier')), \
             patch.object(google_auth.google_oauth, 'exchange_code_for_tokens', return_value={'synthetic': True}) as exchange, \
             patch.object(google_auth.google_oauth, 'store_credentials') as store:
            self.assertEqual(self.client.post('/auth/google/start').status_code, 401)
            response = self.client.post('/auth/google/start', headers={'Authorization': f'Bearer {KEY}'})
            self.assertEqual(response.status_code, 200)
            callback = '/auth/google/callback?state=synthetic-state&code=synthetic-code'
            self.assertEqual(self.client.get(callback).status_code, 302)
            exchange.assert_called_once_with('synthetic-code', 'verifier')
            store.assert_called_once_with({'synthetic': True})
            self.assertEqual(self.client.get(callback).status_code, 401)


if __name__ == '__main__':
    unittest.main()
