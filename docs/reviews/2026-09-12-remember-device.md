# Persistent private sign-in

The owner requested staying signed in on their devices. The unlock screen now
offers remembering the browser for 30 days. Only an expiring signed session is
stored; the owner key remains memory-only. Backend authentication remains
mandatory. Owner-key rotation invalidates sessions; sessions cannot mint renewals.
Signing out removes the local session and broadcasts logout to other tabs,
including temporary sessions. This does not remotely revoke copied tokens.

Restoration verifies the server before private children mount. Offline failures
retain the saved token for retry; expired or rejected sessions are forgotten.
Revision checks prevent a delayed authentication result from undoing sign-out.

Validation: 28 isolated backend security tests and 24 subtests passed; 281 frontend
unit tests and 29 interaction tests passed before the final logout fix; the final
8 gate interaction tests and production build passed afterward. Independent review
identified a missing temporary-tab logout notification, repaired with a separate
logout marker and regression coverage. Browser inspection confirmed the checkbox
and both persistence/temporary-session descriptions on the local build. An initial
local HTTPS certificate error limited that browser attempt; HTTP preview rendered.

Production deployment and credential-safe live checks are recorded after release.
