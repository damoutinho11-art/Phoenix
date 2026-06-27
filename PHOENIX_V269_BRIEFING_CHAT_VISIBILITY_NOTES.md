# PHOENIX v2.69 Briefing + Chat Visibility Fix

This patch keeps the exact v2.64/v2.68 reactor design and fixes the product behavior the user flagged.

## Fixed

- Replaced the wrong standalone brief:
  - old: Good afternoon / heavy legs / 2,840 kcal
  - new: Good morning, Sir. PHOENIX is online...
- Made the main response card more readable.
- Made the chat dock/card more visible.
- Added a parent-side PHOENIX welcome brief state.
- PHOENIX now speaks the welcome brief on the first reactor hold/tap, because browsers block audio before a user gesture.
- Kept the exact reactor design/position/cadence from v2.64/v2.68.

## Important behavior note

Chrome normally blocks autoplay audio on page load. So PHOENIX cannot reliably speak immediately without any click/tap.

The safe behavior is:

1. page loads with visible Good morning, Sir brief
2. first reactor hold/tap triggers the spoken greeting
3. then mic/listening continues normally
