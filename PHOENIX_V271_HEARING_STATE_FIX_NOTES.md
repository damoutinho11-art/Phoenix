# PHOENIX v2.71 Hearing-State Fix

This fixes the bug where PHOENIX stayed stuck on `HEARING SIGNAL`.

## Fixed

- Speech recognition now auto-stops about 1 second after hearing words.
- A hard 8-second timeout prevents the mic from staying open forever.
- Release still stops recognition normally.
- If the browser misses the release event, PHOENIX still moves to Processing.
- The welcome brief no longer starts during the same moment as mic capture, so it does not interfere with recognition.
- Reactor design/position/cadence unchanged from the current correct visual base.

## Expected behavior

1. Hold reactor.
2. Speak: `open finance`.
3. PHOENIX shows `HEARING SIGNAL` briefly.
4. After you pause, it automatically moves to `PROCESSING REQUEST`.
5. It routes/speaks the response.
