# PHOENIX v2.70 Chat Pop + Entry Brief

This patch keeps the exact v2.64/v2.68/v2.69 reactor design and improves the product feel.

## Fixed

- Main PHOENIX brief card now pops much more.
- Chat dock/panel is brighter, sharper, and more readable.
- Input/send controls are more visible.
- PHOENIX attempts to speak the welcome brief every time the home screen loads.
- If Chrome blocks autoplay audio, the first reactor hold/tap retries the welcome brief safely.

## Expected behavior

When entering the app:

1. The visible card says:
   "Good morning, Sir. PHOENIX is online. Finance, recovery, training, and calendar modules are standing by."
2. PHOENIX attempts to speak it automatically.
3. If Chrome blocks autoplay, tap/hold the reactor once and it will speak.
4. Then normal hold-to-speak command flow continues.

## Build

`npm run build` passed.
