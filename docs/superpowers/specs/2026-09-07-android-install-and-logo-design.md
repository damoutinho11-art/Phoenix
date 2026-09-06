# Android Install and Phoenix Logo Design

## Goal

Phoenix will offer a clear Android PWA installation flow and use a new electric cyan-blue phoenix mark as its launcher, splash, favicon, and application identity.

## Logo

The mark will depict a recognizable phoenix with fully spread angular wings, a defined head, and an electric cyan-blue reactor core forming its body. The silhouette will be symmetrical, sharp, futuristic, and readable at small launcher sizes. It will sit on a near-black background and contain no text, enclosing circle, fine decorative lines, or photographic detail.

The master artwork will preserve a generous safe zone so Android can crop it into circular, rounded-square, or squircle masks without removing the head, wing tips, or tail. The icon set will include 512×512 and 192×192 standard PNGs, matching maskable PNGs, an Apple touch icon for completeness, and a favicon. Every derivative will be created from the approved master rather than independently regenerated.

## Android Installation Flow

Phoenix remains a Progressive Web App. A visible **INSTALL PHOENIX** action will appear in the application shell when installation is supported and Phoenix is not already running in standalone mode.

The app will capture the browser's `beforeinstallprompt` event, retain it only for the current page session, and open the native Android installation prompt after the user presses **INSTALL PHOENIX**. Phoenix will report whether the prompt was accepted or dismissed without repeatedly prompting or installing automatically.

When the native event is unavailable, the same action will show concise Chrome instructions: open the browser menu, choose **Add to Home screen**, then choose **Install**. When Phoenix is already installed or running standalone, the action will be hidden.

## PWA Metadata

The web app manifest will reference standard and maskable icons separately, use Phoenix as the app and shortcut name, retain standalone display mode, and update the theme and background colors to match the near-black and electric cyan-blue identity. The page will include the new favicon and touch icon metadata. The service worker will precache the new assets so installed copies receive them through the existing update flow.

## Components and State

Install-event handling will live in a focused reusable hook or utility rather than inside a visual component. It will expose whether installation is available, whether Phoenix is already standalone, the current result state, and an action that either triggers the saved browser prompt or requests the fallback instructions.

The install control will use existing Phoenix shell patterns and remain keyboard accessible. It will not request unrelated permissions, collect data, or claim installation succeeded until the browser returns an accepted outcome.

## Error Handling

Missing or rejected install events will never block normal app use. Dismissal will return Phoenix to an installable state without nagging. An exception while invoking the browser prompt will display the manual Chrome steps. Unsupported browsers will receive the same manual instructions.

## Verification

Automated tests will verify install-event capture, user-triggered prompting, accepted and dismissed outcomes, fallback instructions, standalone suppression, manifest icon purposes, and page metadata. Image verification will confirm exact dimensions, PNG format, safe-zone visibility, and consistent master-derived artwork.

The production build will be installed or exercised at an Android mobile viewport. Verification will confirm the install action, fallback copy, standalone layout, launcher-safe icon rendering, no horizontal overflow, and successful service-worker asset delivery.

## Scope

This work delivers an installable Android PWA. It does not create an APK, Play Store listing, native Android wrapper, account system, push notifications, or background permissions.
