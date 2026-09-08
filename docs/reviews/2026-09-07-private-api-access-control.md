# Private API access control: local remediation

## Observed issue

A credential-free client received sensitive finance responses from the live
service earlier in this session. This confirms missing application authentication
for that client. It does not establish access from every network, absence of
another network control, or third-party access. The earlier health assessment
omitted this confidentiality risk.

## Local implementation

- Default-deny ASGI middleware covers all private routes and HTTP methods,
  including finance, budget, chat, admin, docs and future routes.
- Only exact GET/HEAD `/health` is public. Private endpoints return 401 without
  a valid Bearer key and 503 if server authentication is unconfigured.
- A single owner capability is checked against `PHOENIX_ACCESS_KEY_SHA256`
  using constant-time digest comparison. It is not a multi-user authorization system.
- No trust in Origin, cookies, query parameters, or forwarded network headers.
- Private responses receive `Cache-Control: no-store, private`. PWA runtime API
  caching is removed and the old named API cache is deleted during activation
  and before unlock. Previously downloaded data cannot be recalled from clients.
- The frontend requires successful `/access/check` before mounting private
  screens. Keys remain in tab memory, not browser storage, URLs or build variables.
- Requests disallow redirects and require HTTPS except on loopback hosts.
- CORS uses explicit origins; wildcard Vercel preview access is removed.
- Google connection starts through an authenticated POST. The callback accepts
  only an unexpired, one-time state issued after owner authentication, bound to
  the configured key digest. Key rotation invalidates pending old states.

## Validation

Eight isolated Python security tests passed, with synthetic handlers and requests.
Tests cover pre-dispatch rejection, valid credentials, missing configuration,
rotation, CORS, and the callback predicate. They do not import the production app,
load dotenv, initialize a database, or read private records.

Frontend: 255 Node tests and nine interaction tests passed. Production PWA build
passed. The existing bundle-size warning remains. Independent automated review
was blocked with “Potentially unintended activity”; it did not complete.

No deployment, real credential generation, production requests or private-record
inspection was performed during this remediation. The live service remains
unremediated by these local changes until rollout and verification.

## Deployment procedure

1. Generate an owner key with at least 32 cryptographically random bytes using a
   trusted password manager. Keep it in that manager. Never put it in a `VITE_*`
   variable, source file, URL, command-line argument, screenshot or chat message.
2. Compute its SHA-256 locally using hidden input, for example:

   ```python
   import getpass, hashlib
   key = getpass.getpass('Owner key: ')
   print(hashlib.sha256(key.encode('utf-8')).hexdigest())
   ```

3. Set the digest as the backend secret `PHOENIX_ACCESS_KEY_SHA256`. Configure
   `PHOENIX_ALLOWED_ORIGINS` with the exact intended HTTPS frontend origin(s).
   Configure the frontend API origin using HTTPS.
4. Deploy the backend first so private routes become protected, then deploy the
   frontend unlock flow. Missing key configuration intentionally locks the API.
   Do not roll back to unauthenticated access as a recovery step.
5. Verify credential-free denial using a synthetic, non-sensitive probe such as
   `/access/check`, checking status only. Then verify owner unlock with that same
   probe. Do not use holdings or statement endpoints as health checks.
6. Review deployment/network policy and sanitized access logs through authorized
   administrative tooling to assess exposure. This local work did not inspect them.

## Compatibility and remaining work

All API clients now need a Bearer key. Existing external calendar subscriptions
cannot pass the owner key in a URL; they remain blocked until a separately scoped,
revocable feed-access design is implemented. Google callback handling keeps its
existing in-memory state limitation across replicas/restarts. Browser cache
cleanup applies when the updated frontend/service worker activates.

This patch was tested as a single-owner access boundary, not as a comprehensive
security audit. A full synthetic application integration test and completed
independent security review are required before production rollout.

## Rollout preparation — 2026-09-08

The patch was ported onto the exact deployed commit 56b02ed8 in
codex/private-api-rollout, preserving subsequent production changes.
Fresh validation: 12 backend security tests (including real-app route dispatch,
CORS, probe, OAuth callback and replay), 281 Node tests, 19 React interaction tests,
and production Vite build passed. Existing bundle-size warning remains.
Independent code review completed without actionable findings; the previous
integration-test/review rollout gates are resolved.
An owner key was generated using 32 cryptographically random bytes and stored
with Windows current-user encryption outside the repository. Only its SHA-256
was configured on Railway. Existing explicit production origins were retained.
Live deployment verification is recorded separately after rollout.
