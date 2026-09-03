# Phoenix Mobile Command Layout

## Goal

Make Phoenix usable and readable on phones without changing the approved desktop presentation or domain behavior.

## Root Cause

At widths below 780px, non-Home domains keep the desktop composition and move four wing panels into a horizontal rail. The rail overlaps the centered action area, panel text remains 7-9px, important information starts outside the viewport, and controls crowd the bottom browser safe area. The page technically avoids horizontal document overflow, but the useful interface is compressed and partially hidden.

## Mobile Composition

Home retains its cinematic reactor-led composition, with only safe-area and minimum text-size corrections where necessary. Finance, Nutrition, Training, and Calendar use a dedicated mobile command composition below 780px:

1. Compact domain header and reactor identity at the top.
2. Primary live value and status immediately below the reactor.
3. One vertically scrolling full-width panel stack in domain-defined priority order.
4. Primary domain action after the summary, with secondary actions below it.
5. Fixed five-item navigation above the device safe area.

The mobile view must not use the horizontal wing rail. Panels remain clip-cornered HUD surfaces and keep the domain accent colors, typography families, glow hierarchy, and live data. Minimum body copy is 13px, metadata is 10px, and tap targets are at least 44px high.

## Interaction And Data

Panel taps continue to open the existing focus projection. Domain actions open the same existing control rooms and workflows. No API contracts, calculations, decisions, or write behavior change. The mobile layout consumes the same `domain.panels`, `heroActions`, and live mappings as desktop.

The vertical content region scrolls independently between the header and fixed navigation. It respects `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`. No content may sit behind the navigation, and browser chrome resizing must not hide the final action.

## Desktop Preservation

At 781px and above, the existing `HoloWings`, reactor placement, actions, focus overlays, and dock geometry remain unchanged. Mobile-specific components and rules are selected explicitly by the existing `useMedia('(max-width: 780px)')` boundary.

## Verification

Add source-contract tests proving mobile domains use the vertical command layout and do not render the horizontal rail, while desktop still renders `HoloWings`. Add layout rules for minimum readable type, full-width panels, 44px controls, safe-area navigation, and scroll containment.

Run all PWA tests and a production build. Browser QA covers Home plus every domain at 390x844 and 375x667, and desktop at 1440x900. Assertions include no horizontal overflow, visible navigation, reachable final content, non-overlapping actions, and screenshots without clipped text or incoherent overlap.

## Deployment

Publish from the clean release checkout only. Do not include local Finance state, unshipped Nutrition work, attachment files, or the rejected Daily Command redesign. Vercel authentication is required before the corrected mobile bundle can reach the usual production URL.
