# Local finance day and week boundary

The deployed service used the host calendar date. At 23:40 UTC on September 13, the owner in Tallinn was already on September 14, but recommendations still used Sunday and the previous weekly contribution window.

The shared calendar clock now converts an aware UTC instant to Europe/Tallinn before deriving its date. This matches the saved owner location and the existing calendar timezone. UTC audit timestamps keep their existing format. An explicit tzdata dependency makes timezone rules available on hosts without a system timezone database.

Crypto history requests also retain an exclusive UTC-day boundary. Local Monday must not admit Sunday's unfinished UTC candle as a completed close.

Regression tests cover both sides of local summer midnight, the Monday ISO-week transition, the winter New Year boundary and the crypto provider's exclusive history end. The new tests failed against the previous implementation. Final clock plus finance-domain run: 362 passed and 11 subtests. Combined core/API/security run: 1217 passed, 27 subtests, with three CORS failures caused by importing the app under the regular API suite's origin configuration before the security suite's environment fixture. The security suite expects a fresh import; run separately, all 28 tests and 24 subtests pass. No production CORS code changed. Live deployment checks pending.

No allocation policy, portfolio holding, purchase record or trade approval is changed by this fix.
