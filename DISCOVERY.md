# OpenWrt Firmware Selector — Codebase Discovery

> Generated: 2026-04-29
> Repository: https://github.com/openwrt/firmware-selector-openwrt-org/

---

## 1. Project Overview

A vanilla JavaScript single-page application that lets users search for OpenWrt-compatible routers by device name/model, select a firmware version (stable releases or snapshots), and either download pre-built firmware images or request custom-built images via the [Attended SysUpgrade (ASU)](https://github.com/openwrt/asu) API.

**Live demo:** https://firmware-selector.openwrt.org

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **HTML** | Single `index.html`, no templates, no SSR |
| **CSS** | Hand-written (~470 lines in `index.css`), light/dark mode via `prefers-color-scheme`, no preprocessor |
| **JavaScript** | Vanilla ES Modules (`type="module"`), no bundler, no transpiler |
| **Testing** | Node.js built-in `--test` runner (no Jest/Vitest), minimal mock setup |
| **Linting** | ESLint + Prettier |
| **Package Manager** | Yarn (lockfile: `yarn.lock`) |

### Key characteristic: Zero build step
The app is served as static files. `index.html` loads `config.js` (plain `<script>` tag) then `js/main.js` (ES module). No bundling, no npm build, no transpilation.

---

## 3. File Structure

```
www/                          ← Document root (static served directory)
  index.html                  ← Single HTML page with all DOM structure
  index.css                   ← All styles (~471 lines, single file)
  config.js                   ← Global `var config` configuration object
  favicon.ico
  logo.svg
  device_packages.json.example
  js/
    main.js                   ← Entry point: app initialization & orchestration
    models.js                 ← Version dropdown, device autocomplete, profile fetching
    images.js                 ← Render device info, download buttons, SHA256 hashes, package list building
    asu.js                    ← ASU API client: build request, polling, status UI
    autocomplete.js           ← Custom autocomplete dropdown widget (vanilla)
    translation.js            ← i18n system (CSS-class-based translation)
    utils.js                  ← DOM helpers: $, $$, show, hide, split, htmlToElement, formatDate, setValue, showAlert
  langs/                      ← ~50 translation JSON files (ar.json, de.json, en.json, …)
  uci-defaults/
    setup.sh                  ← First-boot script template for UCI defaults

tests/
  js/
    setup.js                  ← DOM mock setup (minimal jsdom-like polyfill)
    asu.test.js               ← Tests for ASU request builder
    autocomplete.test.js
    images.test.js
    models.test.js
    translation.test.js
    utils.test.js

misc/
  screenshot.png
  .versions.json
  releases/                   ← Sample profile data for local development
    19.07.10/
      .overview.json
      targets/…
    23.05.4/
      .overview.json
      targets/…

tests/profiles/               ← Test fixture data (profiles)
  releases/
  snapshots/
```

---

## 4. Architecture & Data Flow

### 4.1 Initialization (`main.js`)

```
DOMContentLoaded
  ├─ Read URL search params (?version=, ?target=, ?id=)
  ├─ Show "#asu" section if asu_url is configured
  ├─ Fetch "device_packages.json" (optional per-device extra packages map)
  ├─ Fetch config.image_url + "/.versions.json" (upstream version config)
  │    └─ Filter out unsupported versions (19.07.x, 18.06.x, 17.01.x)
  │    └─ Optionally insert snapshot versions (show_snapshots)
  │    └─ Merge into config: versions[], default_version, image_urls, overview_urls
  ├─ setupSelectList("#versions", …)
  │    └─ On version change:
  │         └─ Fetch .overview.json for that version
  │         └─ normalizeOverviewProfiles(obj) → flat profiles dict keyed by title
  │         └─ setupProfilesAutocomplete(version, obj, …)
  │         └─ setModel() to restore deep-link via URL params
  ├─ setupUciDefaults()
  ├─ updateImagesBound()
  ├─ initTranslation()
  └─ Wire up ASU "REQUEST BUILD" button click → buildAsuRequest()
```

### 4.2 Device Search & Selection

1. User types in `#models` input
2. `autocomplete.js` filters `Object.keys(overview.profiles)` client-side
3. On selection → `changeModel()`:
   - Fetch `profiles.json` for the device's target/subtarget
   - Extract images, titles, device_packages from the matching profile
   - Call `updateImages(version, mobj)` to render
   - Update `currentDevice` global state
   - Push URL to `history.replaceState`

### 4.3 Image Rendering (`images.js`)

`updateImages(version, mobj, context)`:
- Clears previous download tables
- Sets device info: model, target, version, date, links
- Renders download buttons (sorted: sysupgrade first, then factory, then others)
- Dual layout: `#downloads1` (table, desktop) / `#downloads2` (list, mobile)
- Shows/hides ASU section based on manifest presence
- Builds pre-filled package list from: default_packages + device_packages + asu_extra_packages + custom device_packages
- Updates URL via history.replaceState

### 4.4 ASU Custom Build (`asu.js`)

1. POST to `$asu_url/api/v1/build` with:
   - profile, target, packages (from textarea), defaults (uci-defaults script)
   - version_code, version, diff_packages: true
   - client, repositories, repository_keys, repositories_mode
2. On 202 (accepted) → poll GET `$asu_url/api/v1/build/$hash` every 5s
3. On 200 (complete) → update images with `asu_image_url`
4. Shows progress bar via CSS class-based translation keys (`tr-init`, `tr-queued`, etc.)
5. On error → show stderr/stdout in expandable sections

### 4.5 Translation System (`translation.js`)

- Elements use CSS classes like `class="tr-model"`, `class="tr-load"`
- Translation JSON maps keys like `"tr-model"` → `"Model"`
- `translate()` applies by querying `$$(".tr-key")` and setting `innerText` or `placeholder`
- No pluralization, no interpolation, no template parameters
- Language selection persists in a `<select>` that is hidden; a styled `<button>` shows the current value

### 4.6 Autocomplete Widget (`autocomplete.js`)

- Custom implementation (not a library)
- Supports multi-word search (split by space/comma), highlights matching substrings
- Limits to 15 visible items
- Keyboard navigation: up/down arrows, Enter to select
- Matches via `match()` which checks all patterns exist in the item (AND logic)

---

## 5. State Management

**Current approach: Implicit & mutable global state**

| State | Location | Notes |
|-------|----------|-------|
| `currentDevice` | Module-level variable in `main.js` | `{ version, id, target }`, updated via `setCurrentDevice()` |
| Selected version | `$("#versions").value` | Read from DOM directly |
| Selected model | `$("#models").value` | Read from DOM directly |
| ASU packages | `$("#asu-packages").value` | Read from DOM directly |
| Config | `window.config` (global `var`) | Modified in-place during init (versions, default_version, image_urls, overview_urls) |
| URL params | `URLSearchParams` | Read once at init, used for deep-linking |
| Custom device packages | Module-level `customDevicePackages` in `main.js` | Loaded once from `device_packages.json` |

**No reactive system** — every change manually triggers `updateImages()`.

---

## 6. Key Pain Points & Patterns

### Pain Points

1. **Global mutable state** — `currentDevice`, `config` mutated in-place, hard to reason about data flow
2. **DOM as data source** — reading `$("#versions").value` etc. instead of a data layer
3. **Monolithic `main.js`** — orchestrates everything, hard to test in isolation
4. **CSS-class-based i18n** — no interpolation support, no fallback, no dynamic parameters
5. **Dual download layout** — `#downloads1`/`#downloads2` with display:none switching, fragile
6. **Error handling** — single red alert bar, no structured error recovery, no retry logic
7. **No build tool** — no TypeScript, no CSS preprocessing, no bundling, no hot reload
8. **Test coverage gaps** — many modules tested, but integration/flow tests missing
9. **Accessibility** — minimal ARIA, keyboard nav is basic, no focus management
10. **Responsive/mobile** — works but layout changes are abrupt (CSS media queries hide/show entire sections)
11. **Loading states** — minimal spinners, no skeleton screens, progress bar only for ASU builds
12. **Hardcoded translations in HTML** — `<option>` text for language selector is duplicated in HTML and would need updating if new langs are added

### Architecture Patterns

- **Module pattern** — ES modules, each file exports functions
- **Function-based composition** — `createAsuRequestBuilder(context)` returns a closure
- **Imperative DOM manipulation** — `append()`, `htmlToElement()`, direct `innerHTML` assignments
- **Fetch-based data loading** — no caching layer, no request deduplication
- **Callback-based flow** — `onbegin`/`onend` callbacks in autocomplete, `onselection` in setupSelectList

---

## 7. Data Sources

| Source | URL Pattern | Format | Contents |
|--------|------------|--------|----------|
| Upstream config | `$image_url/.versions.json` | JSON | `{ stable_version, versions_list[], upcoming_version?, image_url_override? }` |
| Version overview | `$image_url/releases/$version/.overview.json` | JSON | `{ release, profiles: [{ id, titles, target }] }` |
| Device profiles | `$image_url/targets/$target/profiles.json` | JSON | `{ profiles: { $id: { images, titles, device_packages, … } } }` |
| Device packages | `www/device_packages.json` | JSON | `{ "vendor,model": ["pkg1", "pkg2"], … }` |

---

## 8. Configuration (`config.js`)

```js
var config = {
  show_help: true,                    // Show help text for images
  versions: ["23.05.4", "19.07.10"],  // Override versions list
  default_version: "23.05.4",         // Pre-selected version
  image_url: "../misc",               // Image download URL base
  show_snapshots: true,               // Insert snapshot versions
  info_url: "https://...&q={title}",  // Info link template
  asu_url: "https://sysupgrade.openwrt.org",  // ASU API URL
  asu_extra_packages: ["luci", "luci-app-attendedsysupgrade"],
  asu_repositories: { … },            // Extra package repos (optional)
  asu_repositories_mode: "append",    // "append" or "replace"
  asu_repository_keys: ["…"],         // GPG keys for extra repos
};
```

---

## 9. Test Suite

- **Runner:** `node --test tests/js/*.test.js`
- **DOM mock:** Custom minimal mock in `setup.js` — not jsdom, just enough for unit tests
- **Coverage:** `node --test --experimental-test-coverage tests/js/*.test.js`
- **Modules tested:** ASU, autocomplete, images, models, translation, utils
- **Notable patterns:**
  - `globalThis.fetch` is replaced in each test
  - `document.querySelector` is mocked via `document._qsImpl`
  - Tests use `mockElement()` to create minimal DOM stubs

---

## 10. Key Open Questions for Profound Changes

1. **Framework migration?** — React, Vue, Svelte, or stay vanilla?
2. **Build tooling?** — Vite, esbuild, or keep zero-build?
3. **State management?** — Keep simple module state, or use a library (Zustand, Pinia)?
4. **CSS approach?** — CSS modules, Tailwind, styled-components, or stay with plain CSS?
5. **API layer?** — React Query, SWR, or custom fetch wrappers with caching?
6. **Routing?** — React Router / Vue Router for URL state, or keep query params?
7. **Testing?** — Vitest, Playwright for E2E, or keep node:test?
8. **ASU integration scope?** — Keep as-is, or enhance significantly?
9. **Accessibility target?** — WCAG 2.1 AA compliance desired?
10. **i18n improvements?** — Proper library (i18next, vue-i18n) needed?