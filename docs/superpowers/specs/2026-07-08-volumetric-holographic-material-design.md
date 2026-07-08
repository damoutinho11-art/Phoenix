# Volumetric Holographic Material Design

## Goal

Make the existing Finance, Nutrition, Training, and Calendar interfaces feel like premium volumetric holographic glass without changing their layouts, features, metrics, hierarchy, or behavior. Home remains unchanged.

This design replaces the earlier cross-domain hologram-instrument concept. No new hero cores, telemetry rows, radar instruments, projection bases, or dashboard compositions are introduced.

## Scope

The first implementation covers the four existing main command centers:

- Finance
- Nutrition
- Training
- Calendar

Existing detail and subsection screens are deferred until the main screens are visually approved.

## Preserved Interface

Each command center retains its current:

- component order and responsive layout;
- panel and feature dimensions;
- headings, metrics, controls, and navigation;
- dashboard-model values and honest placeholders;
- domain behavior and safety rules; and
- internal scrolling and mobile structure.

The implementation may add presentation wrappers or decorative pseudo-elements only where required to create the material effect. It must not add or duplicate information.

## Holographic Glass Material

Existing feature surfaces become sharp rectangular volumetric glass panes. The material uses:

- a subtle 3–5 pixel rear-plane offset;
- thin visible right and bottom edge thickness;
- approximately one degree of perspective, never enough to distort reading;
- transparent blue-gray or domain-tinted fill;
- backdrop blur and restrained saturation;
- a fine internal border and selective specular rim highlights;
- faint refraction and light variation inside the pane;
- a small contact shadow separating the pane from its background; and
- restrained domain-colored emission around active data and controls.

Corners remain sharp. There are no rounded cards, oversized floating panels, pedestals, projector bases, spheres, or literal three-dimensional props.

## Background

The command-center background remains code-native CSS and contains no embedded image or photographic control-room scene.

Use a plain layered dark blue-gray background with enough midtone variation for transparency to remain legible. Permitted layers are soft radial light fields, restrained architectural gradients, sparse particles, and very faint linear traces.

Do not use triangular meshes, repeating fence patterns, dense perspective grids, or textures that compete with the existing interface.

## Motion

Motion reinforces the material without changing state or meaning:

- slow 2–3 pixel pane drift;
- a fine, infrequent specular or scan pass;
- quiet data or edge-energy pulses;
- sparse particle drift; and
- subtle active-status glow.

Motion must remain restrained and premium rather than arcade-like. Under `prefers-reduced-motion: reduce`, all continuous pane drift, sweeps, flicker, particle motion, rotations, and nonessential transitions stop while visual depth and information remain.

## Typography and Domain Identity

- Domain names use a high-readability warm white.
- `COMMAND CENTER` uses the existing domain accent.
- Finance retains cyan.
- Nutrition retains green.
- Training retains orange.
- Calendar retains violet.
- Green is reserved for verified, live, safe, or successful states rather than general decoration.

## Component Boundary

Implement one shared presentation layer for holographic atmosphere and volumetric surface styling. The layer owns material classes, decorative elements, motion, and reduced-motion behavior only.

Domain dashboards opt existing containers into the shared classes. Existing domain components continue to own data interpretation, copy, controls, navigation, and behavior.

No backend, API, database, router, or dashboard-model contract changes are allowed.

## Accessibility and Interaction

- Decorative layers use `aria-hidden="true"` and `pointer-events: none`.
- Glass styling cannot reduce control hit areas or focus visibility.
- Text remains readable over every background zone.
- Perspective and animation cannot interfere with input targeting.
- Existing semantic headings and accessible labels remain unchanged.

## Verification

- Add shared material contracts for sharp corners, pointer transparency, restrained depth, and reduced-motion behavior.
- Add per-domain adoption guards without requiring new data or markup hierarchy.
- Protect Home from adoption.
- Run the complete PWA test suite and production build.
- Visually inspect each domain at 390×844 and the default desktop viewport.
- Compare before and after screenshots to verify that geometry and content remain unchanged while the material feel changes.
