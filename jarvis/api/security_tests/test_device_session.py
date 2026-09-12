import unittest
from unittest.mock import patch
from jarvis.api.security_tests.test_app_access_control import AppAccessControlTests, KEY


class DeviceSessionTests(AppAccessControlTests):
    def test_owner_can_issue_expiring_session_but_session_cannot_renew(self):
        response=self.client.post('/access/session',headers={'Authorization':f'Bearer {KEY}'})
        self.assertEqual(response.status_code,200)
        body=response.json(); token=body['token']
        self.assertNotIn(KEY,token)
        self.assertIn('no-store',response.headers['cache-control'])
        headers={'Authorization':f'Bearer {token}'}
        self.assertEqual(self.client.get('/access/check',headers=headers).status_code,200)
        self.assertEqual(self.client.post('/access/session',headers=headers).status_code,403)
        with patch('jarvis.api.access_control.time.time',return_value=body['expires_at']):
            self.assertEqual(self.client.get('/access/check',headers=headers).status_code,401)
        with patch.dict('os.environ',{'PHOENIX_ACCESS_KEY_SHA256':'a'*64}):
            self.assertEqual(self.client.get('/access/check',headers=headers).status_code,401)
        headers['Authorization']=f'Bearer {token[:-1]}x'
        self.assertEqual(self.client.get('/access/check',headers=headers).status_code,401)
