# Finance Production Truth Design

## Goal

PHOENIX finance must display and recommend from the current Railway state only. A missing, unreachable, or stale finance source must never be replaced by realistic fixture values.

## Data Flow

The Vercel build receives `VITE_API_URL=https://phoenix-production-1fb2.up.railway.app`. The API client treats a missing production URL as a configuration error. `useHoloData` exposes per-domain loading and error state, and the finance domain converts an unavailable response into an explicit offline projection with recommendations paused.

## Safety

Railway remains the source of truth for holdings, prices, recommendations, and briefs. Recommendations fail closed when portfolio holdings or price refresh metadata are stale, malformed, missing, or in the future. A market-regime lookup failure returns an unknown regime and pauses the recommendation instead of assuming `risk_on`.

## Interface

When finance is unavailable, the hero and finance panels show `FINANCE DATA OFFLINE`, `LAST VERIFIED: UNKNOWN`, and `RECOMMENDATIONS PAUSED`. They show no portfolio amount, allocation percentages, performance claims, or buy instructions. Other domains keep their existing fallback behavior.

## Acceptance

- Frontend and backend regression tests pass.
- A production build contains the Railway API origin and no production localhost fallback.
- A clean browser's finance total equals `/finance/summary` from Railway.
- Simulated API failure produces the explicit offline state and no fixture finance values.
