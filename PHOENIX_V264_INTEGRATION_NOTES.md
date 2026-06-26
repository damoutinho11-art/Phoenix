# PHOENIX v2.64 Integration Notes

This project has been updated to use the finalized PHOENIX v2.64 opening screen as the app home screen.

## What changed

- Added `pwa/public/phoenix/opening.html`
- Added `pwa/src/components/PhoenixOpeningScreen/`
- Updated `pwa/src/App.jsx`
- The app now starts on the PHOENIX opening screen.
- The normal app chrome/topbar/bottom navigation is hidden on the PHOENIX opening screen.
- Clicking side modules opens the existing app areas:
  - Finance -> finance
  - Training -> training
  - Recovery -> nutrition
  - Calendar -> calendar
- The bottom-right fixed Finance button remains removed.

## Run locally

```powershell
cd pwa
npm install
npm run build
npm run dev
```

## Validation note

A build was attempted in the Linux sandbox, but the uploaded project includes platform-specific/Windows `node_modules`.
Rollup's Linux optional dependency was missing, so the sandbox build could not complete here.

On your Windows PC, running `npm install` inside `pwa` should restore the correct dependencies.
