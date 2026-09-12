# Remember this device

Owner requested persistent sign-in while keeping the dashboard private.
Issue a separate signed 30-day bearer session after owner-key authentication.
Do not persist the owner key. Bind signatures to the configured owner-key digest
so key rotation invalidates every session. Sessions cannot issue or renew sessions.
The browser saves the session only when remember-device is selected; restores it
on startup and verifies access before mounting private content. Temporary network
failure retains the session for retry. Expiry, 401 and sign-out clear it; sign-out
also notifies other tabs on the same origin. This is browser storage, not a
hardware-bound credential. Signing out forgets the local token; copied tokens
remain usable until expiry or owner-key rotation.

Implementation: signed session helpers and protected issuance endpoint; browser
session persistence and gate restoration; security and UI regression tests,
independent review, backend/frontend deployment and live access verification.
