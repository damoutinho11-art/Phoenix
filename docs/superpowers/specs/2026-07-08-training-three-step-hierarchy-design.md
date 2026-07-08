# Training Three-Step Hierarchy Design

## Goal

Make the Training command center accurately present its primary workflow as three numbered actions while retaining telemetry and module navigation as supporting information.

## Interface

The numbered workflow remains:

1. Check In
2. Warm-up
3. Today’s Session

Telemetry and Modules remain in their current positions below the session, but use unnumbered section headers. No API, routing, readiness, session-start, telemetry, or module behavior changes.

## Contract

The Training UI contract will assert the current “Today’s Session” language and the three-step hierarchy. It will also protect Telemetry and Modules from being presented as steps 4 and 5.

## Verification

Run the focused Training frontend contract tests, the complete PWA test suite, and the PWA production build. Then inspect the rendered Nutrition and Training command centers at the mobile layout.
