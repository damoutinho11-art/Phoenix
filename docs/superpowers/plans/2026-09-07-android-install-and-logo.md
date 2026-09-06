# Android Install and Phoenix Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Phoenix a recognizable electric cyan-blue phoenix icon and an honest Android PWA installation flow.

**Architecture:** Create one approved high-resolution logo master, derive every launcher asset from it, and wire those assets into the Vite PWA manifest and page metadata. A focused install controller owns browser install-event state; a small shell component renders the native prompt action or manual Android Chrome instructions.

**Tech Stack:** React 18, Vite 5, vite-plugin-pwa, Node test runner, Vitest, Pillow image verification, built-in ImageGen.

## Global Constraints

- Logo is a recognizable phoenix with spread angular wings, defined head, and electric cyan-blue reactor core.
- Background is near-black; no text, enclosing circle, fine decorative lines, or photographic detail.
- All derivatives come from one approved master and preserve Android maskable safe zones.
- Delivery is an installable PWA, not an APK.
- Installation occurs only after the user presses **INSTALL PHOENIX**.
- Unsupported browsers receive Chrome instructions: menu → **Add to Home screen** → **Install**.
- The install action is hidden in standalone mode.
- Phoenix never claims installation succeeded before an accepted browser outcome.

---

### Task 1: Create and Validate the Phoenix Icon Set

**Files:**
- Create: `pwa/public/icons/phoenix-master.png`
- Replace: `pwa/public/icons/icon-192.png`
- Replace: `pwa/public/icons/icon-512.png`
- Create: `pwa/public/icons/icon-maskable-192.png`
- Create: `pwa/public/icons/icon-maskable-512.png`
- Create: `pwa/public/icons/apple-touch-icon.png`
- Create: `pwa/public/icons/favicon-32.png`
- Create: `pwa/scripts/verify-icons.py`

**Interfaces:**
- Produces one 1024×1024 master and deterministic resized PNG derivatives.
- Maskable artwork keeps all meaningful pixels inside the central 80% safe region.

- [ ] **Step 1: Create the failing icon verification script**

```python
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
EXPECTED = {
    "phoenix-master.png": (1024, 1024),
    "icon-192.png": (192, 192),
    "icon-512.png": (512, 512),
    "icon-maskable-192.png": (192, 192),
    "icon-maskable-512.png": (512, 512),
    "apple-touch-icon.png": (180, 180),
    "favicon-32.png": (32, 32),
}

for name, size in EXPECTED.items():
    image = Image.open(ROOT / name)
    assert image.format == "PNG", name
    assert image.size == size, (name, image.size)
    assert image.mode in {"RGB", "RGBA"}, (name, image.mode)

print(f"verified {len(EXPECTED)} Phoenix icon assets")
```

- [ ] **Step 2: Run icon verification and confirm RED**

Run: `python pwa/scripts/verify-icons.py`

Expected: FAIL because the new master and derivative assets do not exist.

- [ ] **Step 3: Generate and approve the master**

Use the built-in ImageGen tool with this production prompt:

```text
Use case: logo-brand
Asset type: Android PWA launcher icon master
Primary request: Create a recognizable symmetrical phoenix with fully spread angular wings, a clearly defined small head, and an electric cyan-blue glowing reactor core forming its body.
Scene/backdrop: near-black square background
Style/medium: premium vector-friendly sci-fi emblem, crisp bold silhouette
Composition/framing: centered, strong at 32px, generous empty safe zone around the bird
Color palette: electric cyan-blue and restrained ice-blue highlights on near-black
Constraints: no text, no letters, no enclosing circle, no fine decorative lines, no gradients outside the cyan glow, no photographic detail, no watermark; keep head, wings, and tail inside the central 80 percent
```

Inspect the result at full size and as a 32px preview. Iterate only if the phoenix silhouette, head, wing separation, or safe zone is unclear. Copy the approved image to `phoenix-master.png`.

- [ ] **Step 4: Derive all icon sizes from the master**

Use Pillow `Image.Resampling.LANCZOS` to create the standard, maskable, touch, and favicon assets. Add extra near-black canvas padding only for maskable variants; do not regenerate them.

- [ ] **Step 5: Run icon verification and confirm GREEN**

Run: `python pwa/scripts/verify-icons.py`

Expected: `verified 7 Phoenix icon assets`.

- [ ] **Step 6: Commit the icon set**

```powershell
git add pwa/public/icons pwa/scripts/verify-icons.py
git commit -m "feat(pwa): add electric-blue Phoenix icon set"
```

### Task 2: Update PWA Manifest and Page Identity

**Files:**
- Modify: `pwa/vite.config.js`
- Modify: `pwa/index.html`
- Modify: `pwa/src/pwaUpdateContract.test.js`

**Interfaces:**
- Manifest standard icons: `icon-192.png`, `icon-512.png`.
- Manifest maskable icons: `icon-maskable-192.png`, `icon-maskable-512.png`.
- Theme color: `#00cfff`.
- Background color: `#010608`.

- [ ] **Step 1: Write failing metadata assertions**

Add assertions that the config and page contain the new icon files, separate `purpose: 'maskable'`, `theme_color: '#00cfff'`, Apple touch icon, favicon, and matching HTML theme color.

- [ ] **Step 2: Run contract test and confirm RED**

Run: `node --test src/pwaUpdateContract.test.js` from `pwa`.

Expected: FAIL on missing maskable icon and electric-blue theme metadata.

- [ ] **Step 3: Implement manifest and page metadata**

Update manifest icons:

```js
icons: [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]
```

Set `theme_color` to `#00cfff`, keep `background_color` at `#010608`, and include all icon assets in the service-worker asset set. Update `index.html` to reference `favicon-32.png`, `apple-touch-icon.png`, and `#00cfff`.

- [ ] **Step 4: Run metadata test and build**

Run:

```powershell
node --test src/pwaUpdateContract.test.js
npm run build
```

Expected: contract passes and the production build includes all icons in its output.

- [ ] **Step 5: Commit metadata**

```powershell
git add pwa/vite.config.js pwa/index.html pwa/src/pwaUpdateContract.test.js
git commit -m "feat(pwa): publish Android launcher metadata"
```

### Task 3: Implement the Android Install Controller

**Files:**
- Create: `pwa/src/pwaInstall.js`
- Create: `pwa/src/pwaInstall.test.js`

**Interfaces:**
- Produces: `createPwaInstallController({ windowRef, displayMode })`.
- Controller methods: `subscribe(listener)`, `getSnapshot()`, `install()`, `dispose()`.
- Snapshot fields: `available`, `standalone`, `status`, `showInstructions`.

- [ ] **Step 1: Write failing controller tests**

Cover event capture with `preventDefault`, prompt only from `install()`, accepted and dismissed outcomes, fallback instructions without an event, standalone suppression, `appinstalled`, and listener cleanup.

- [ ] **Step 2: Run controller tests and confirm RED**

Run: `node --test src/pwaInstall.test.js`

Expected: FAIL because `pwaInstall.js` does not exist.

- [ ] **Step 3: Implement the controller**

The controller stores one deferred prompt, derives standalone state from display mode, and returns:

```js
{
  available: !standalone,
  standalone,
  status: 'idle' | 'prompting' | 'accepted' | 'dismissed' | 'manual',
  showInstructions: status === 'manual',
}
```

`install()` invokes `prompt()` only when a deferred event exists, awaits `userChoice`, clears the event after use, and switches to manual instructions on missing prompt or exception. `appinstalled` sets accepted/standalone state. `dispose()` removes both window listeners.

- [ ] **Step 4: Run controller tests and confirm GREEN**

Run: `node --test src/pwaInstall.test.js`

Expected: all install-controller tests pass.

- [ ] **Step 5: Commit the controller**

```powershell
git add pwa/src/pwaInstall.js pwa/src/pwaInstall.test.js
git commit -m "feat(pwa): control Android installation state"
```

### Task 4: Add Install Phoenix to the App Shell

**Files:**
- Create: `pwa/src/components/InstallPhoenix.jsx`
- Create: `pwa/src/components/InstallPhoenix.interaction.test.jsx`
- Modify: `pwa/src/App.jsx`
- Modify: `pwa/src/index.css`
- Modify: `pwa/package.json`

**Interfaces:**
- Consumes the install controller snapshot and `install()`.
- Renders `INSTALL PHOENIX` only outside standalone mode.
- Manual copy is exactly: `Chrome menu → Add to Home screen → Install`.

- [ ] **Step 1: Write the failing interaction tests**

Mock the controller and verify the visible button calls `install()`, manual instructions appear for fallback status, dismissal remains truthful, and standalone mode renders no install control.

- [ ] **Step 2: Run interaction tests and confirm RED**

Run: `npx vitest run src/components/InstallPhoenix.interaction.test.jsx --environment jsdom`

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the component and shell integration**

Render a compact electric-blue install chip above the bottom navigation. Use a real `button`, visible focus state, `aria-live="polite"` for status, and a dismissible manual-instruction panel. Instantiate and dispose the controller through React effects. Do not render when standalone or accepted.

- [ ] **Step 4: Add the interaction test to the PWA test script**

Append `src/components/InstallPhoenix.interaction.test.jsx` to the explicit Vitest file list in `pwa/package.json`.

- [ ] **Step 5: Run PWA tests and build**

Run:

```powershell
npm test
npm run build
```

Expected: all Node and interaction tests pass; Vite build succeeds.

- [ ] **Step 6: Commit the install UI**

```powershell
git add pwa/src/components/InstallPhoenix.jsx pwa/src/components/InstallPhoenix.interaction.test.jsx pwa/src/App.jsx pwa/src/index.css pwa/package.json
git commit -m "feat(pwa): add Android install action"
```

### Task 5: Production Verification and Deployment

**Files:**
- No planned source changes.

- [ ] **Step 1: Run full verification**

Run:

```powershell
python pwa/scripts/verify-icons.py
python -m pytest -q
Set-Location pwa
npm test
npm run build
```

Expected: icon checks, backend suite, PWA suite, and build all pass.

- [ ] **Step 2: Push the reviewed commit**

Run `git diff --check`, confirm a clean worktree, then `git push origin HEAD:main`.

- [ ] **Step 3: Deploy the PWA**

Deploy through the linked Vercel production project and wait for `READY`.

- [ ] **Step 4: Verify production at Android dimensions**

At 390×844 confirm the new logo assets load, `INSTALL PHOENIX` is keyboard accessible, fallback instructions are correct when native prompting is unavailable, the app has no horizontal overflow or console errors, and installed/standalone mode suppresses the action.

- [ ] **Step 5: Verify manifest and service worker**

Fetch production `manifest.webmanifest` and confirm names, colors, standard icons, separate maskable purposes, and HTTP 200 for every asset. Confirm the service-worker precache contains the new filenames.

