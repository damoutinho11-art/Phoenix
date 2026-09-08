"""Fail-closed, single-owner API access control. No private-data dependencies."""
import hashlib
import hmac
import os
import re

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse


def configured_key_digest():
    digest = os.getenv('PHOENIX_ACCESS_KEY_SHA256', '').strip().lower()
    return digest if re.fullmatch(r'[0-9a-f]{64}', digest) else None


class AccessControlMiddleware:
    def __init__(self, app, callback_authorized=None):
        self.app = app
        self.callback_authorized = callback_authorized

    async def __call__(self, scope, receive, send):
        if scope['type'] not in {'http', 'websocket'}:
            return await self.app(scope, receive, send)
        if scope['type'] == 'websocket':
            return await send({'type': 'websocket.close', 'code': 1008})
        # Only this exact, non-sensitive liveness route is public.
        if scope['path'] == '/health' and scope['method'] in {'GET', 'HEAD'}:
            return await self.app(scope, receive, send)

        async def private_send(message):
            if message['type'] == 'http.response.start':
                headers = MutableHeaders(scope=message)
                headers['Cache-Control'] = 'no-store, private'
                headers['Pragma'] = 'no-cache'
                headers['Referrer-Policy'] = 'no-referrer'
                headers.add_vary_header('Authorization')
            await send(message)

        digest = configured_key_digest()
        if not digest:
            response = JSONResponse({'detail': 'Private API access is not configured.'}, status_code=503)
            return await response(scope, receive, private_send)
        auth = Headers(scope=scope).get('authorization', '')
        scheme, _, token = auth.partition(' ')
        authorized = (scheme.lower() == 'bearer' and bool(token) and len(token) <= 1024
                      and hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), digest))
        # OAuth state is a short-lived, one-time credential issued only after owner authentication.
        if not authorized and self.callback_authorized:
            authorized = self.callback_authorized(scope)
        if not authorized:
            response = JSONResponse({'detail': 'Authentication required.'}, status_code=401,
                                    headers={'WWW-Authenticate': 'Bearer'})
            return await response(scope, receive, private_send)
        return await self.app(scope, receive, private_send)
