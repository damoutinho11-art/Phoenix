"""Isolated tests: no production app, database, dotenv, or private records."""
import hashlib
import unittest
import ast
import time
from pathlib import Path
from urllib.parse import parse_qs
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware

from jarvis.api.access_control import AccessControlMiddleware

KEY = "synthetic-test-key-not-a-real-secret-123456789"
DIGEST = hashlib.sha256(KEY.encode()).hexdigest()


class AccessControlTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        app = FastAPI()
        @app.get('/health')
        def health():
            return {"status": "ok"}
        @app.api_route('/{path:path}', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
        def private(path: str):
            self.calls.append(path)
            return {"synthetic_private_data": True}
        app.add_middleware(AccessControlMiddleware)
        self.client = TestClient(app)
        self.env = patch.dict('os.environ', {'PHOENIX_ACCESS_KEY_SHA256': DIGEST})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_all_private_routes_deny_without_credentials_before_dispatch(self):
        for path in ['/finance/holdings', '/finance/data-coverage', '/budget/status',
                     '/jarvis/chat', '/admin', '/docs', '/openapi.json', '/health/details']:
            for method in ['GET', 'POST', 'DELETE']:
                with self.subTest(path=path, method=method):
                    r = self.client.request(method, path)
                    self.assertEqual(r.status_code, 401)
                    self.assertNotIn('synthetic_private_data', r.text)
                    self.assertIn('no-store', r.headers['cache-control'])
        self.assertEqual(self.calls, [])

    def test_valid_bearer_allows_request_without_caching(self):
        r = self.client.get('/finance/holdings', headers={'Authorization': f'Bearer {KEY}'})
        self.assertEqual(r.status_code, 200)
        self.assertIn('no-store', r.headers['cache-control'])
        self.assertIn('Authorization', r.headers['vary'])

    def test_origin_cookies_and_query_keys_are_not_authentication(self):
        for headers in [{'Origin': 'https://trusted.example'}, {'Cookie': f'token={KEY}'},
                        {'Authorization': 'Bearer wrong'}, {'Authorization': f'Basic {KEY}'}]:
            r = self.client.get('/finance/holdings?token=' + KEY, headers=headers)
            self.assertEqual(r.status_code, 401)
        self.assertEqual(self.calls, [])

    def test_missing_or_malformed_configuration_fails_closed(self):
        for digest in ['', 'bad', 'z' * 64]:
            with patch.dict('os.environ', {'PHOENIX_ACCESS_KEY_SHA256': digest}):
                r = self.client.get('/finance/holdings', headers={'Authorization': f'Bearer {KEY}'})
                self.assertEqual(r.status_code, 503)
                self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.calls, [])

    def test_key_rotation_revokes_old_key(self):
        new_digest = hashlib.sha256(b'new-synthetic-key').hexdigest()
        with patch.dict('os.environ', {'PHOENIX_ACCESS_KEY_SHA256': new_digest}):
            self.assertEqual(self.client.get('/finance/holdings', headers={'Authorization': f'Bearer {KEY}'}).status_code, 401)

    def test_preflight_does_not_grant_access_or_trust_unlisted_origin(self):
        app = FastAPI()
        @app.get('/finance/holdings')
        def protected():
            self.fail('Preflight or unauthenticated request reached handler')
        app.add_middleware(AccessControlMiddleware)
        app.add_middleware(CORSMiddleware, allow_origins=['https://trusted.example'],
                           allow_methods=['GET'], allow_headers=['Authorization'])
        client = TestClient(app)
        for origin, expected in [('https://trusted.example', 200), ('https://other.vercel.app', 400)]:
            r = client.options('/finance/holdings', headers={'Origin': origin,
                'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization'})
            self.assertEqual(r.status_code, expected)
            self.assertNotIn('synthetic_private_data', r.text)
        self.assertEqual(client.get('/finance/holdings', headers={'Origin': 'https://trusted.example'}).status_code, 401)

    def test_google_callback_exception_requires_unexpired_owner_bound_state(self):
        # Compile just the pure predicate; never import connectors, database or production app.
        source = Path(__file__).parents[1] / 'routers' / 'google_auth.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        predicate = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'authorized_callback')
        namespace = {'parse_qs': parse_qs, 'time': time, '_STATE_TTL_SECONDS': 600,
                     '_pending_states': {}, 'configured_key_digest': lambda: DIGEST}
        exec(compile(ast.Module(body=[predicate], type_ignores=[]), str(source), 'exec'), namespace)
        check = namespace['authorized_callback']
        scope = {'path': '/auth/google/callback', 'method': 'GET', 'query_string': b'state=synthetic-state'}
        self.assertFalse(check(scope))
        namespace['_pending_states']['synthetic-state'] = {'created': time.time(), 'owner_digest': DIGEST}
        self.assertTrue(check(scope))
        self.assertFalse(check({**scope, 'path': '/finance/holdings'}))
        self.assertFalse(check({**scope, 'method': 'POST'}))
        self.assertFalse(check({**scope, 'query_string': b'state=synthetic-state&state=synthetic-state'}))
        namespace['_pending_states']['synthetic-state']['created'] = time.time() - 601
        self.assertFalse(check(scope))
        namespace['_pending_states']['synthetic-state'] = {'created': time.time(), 'owner_digest': 'rotated'}
        self.assertFalse(check(scope))

    def test_production_source_installs_gate_and_explicit_cors(self):
        source = (Path(__file__).parents[1] / 'main.py').read_text(encoding='utf-8')
        self.assertIn('app.add_middleware(AccessControlMiddleware', source)
        self.assertNotIn('allow_origin_regex=', source)
        self.assertIn("@app.get('/access/check'", source)


if __name__ == '__main__':
    unittest.main()
