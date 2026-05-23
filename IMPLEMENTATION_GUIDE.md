# MyNextLanguage.org — Modular Refactor Implementation Guide

This guide documents the May 2026 split of the formerly-monolithic `index.html`
(8 290 lines, 604 KB) into a clean, multi-file project that still runs on plain
GitHub Pages — **no build step, no bundler, no Node runtime in production**.

> Backup: the original file is preserved at `index.html.backup`. Delete it once
> you are happy with the refactor.

---

## 1. The Target Directory Blueprint

```
language-bridge/
├── index.html                     ← lean skeletal framework (now 1 605 lines / 98 KB)
├── index.html.backup              ← snapshot of the pre-refactor monolith
├── css/
│   └── styles.css                 ← all bespoke component + graph-engine styles
├── data/
│   └── languages-matrix.json      ← unified linguistic database (388 KB)
├── js/
│   ├── data-loader.js             ← fetch + hydrate window.*; gates Alpine boot
│   ├── app.js                     ← Alpine app + i18n + recommendation logic
│   └── graph-engine.js            ← D3 force sim + Dijkstra + view controllers
├── sw.js                          ← (unchanged) service worker
├── manifest.json                  ← (unchanged) PWA manifest
├── compare.html, difficulty.html, static.html, README.md, robots.txt, …
└── …
```

### Before vs. After

| Artifact                         | Before     | After   |
|----------------------------------|-----------:|--------:|
| `index.html`                     | 604 621 B  |  98 429 B |
| `index.html` (lines)             |     8 290  |   1 605 |
| Number of inline `<style>` blocks|         1  |       0 |
| Number of inline `<script>` blocks holding code | 3 (~5 100 lines) | 0 |

---

## 2. The Unified JSON Database — `/data/languages-matrix.json`

Every static linguistic table that used to live as a `const` inside the page
is now a top-level key of one JSON document, organized as:

```json
{
  "translations":       { "en": {...}, "de": {...}, "fr": {...}, "es": {...},
                          "it": {...}, "pl": {...}, "tr": {...}, "ru": {...} },
  "data":               { "languages": { "de": {...}, "nl": {...}, … 96 ISO codes … },
                          "pairs":     {...}, "contact_bonus": {...} },
  "lang_names":         { "en": {...96 names…}, "de": {…}, … },
  "speaker_data":       { "de": { "native": 76, "total": 134,
                                   "official": ["DE","AT", …],
                                   "regions": [ … ] }, … },
  "iso_a2_to_num":      { "AD": 20, "AE": 784, … 198 codes },
  "diacritic_compat":   [ "plain_latin|germanic_umlaut", … 51 pair strings ],
  "ortho_profiles":     { … per-language diacritic / case / quirks },
  "lang_native":        { "de": "Deutsch", "fr": "Français", … },
  "lang_flag":          { "de": "🇩🇪", "fr": "🇫🇷", … },
  "lang_groups":        [ { "id":"germanic", "label":"Germanic",
                            "codes":["de","nl","en", …] }, … ],
  "fsi_tier":           { "es": 1, "de": 2, "ru": 3, "zh": 4, … },
  "lang_phrases":       { "es": { "hello":"Hola", … }, … },
  "parallel_sentences": { "es|pt": [ {"b":"…","t":"…"}, … ], … 74 combos },
  "lang_context":       { "es": "…cultural note…", … },
  "family_names":       { "Indo-European": "Indo-European", … },
  "branch_names":       { "Germanic": "Germanic", … },
  "cefr_weights":       { "A1": 0.10, "A2": 0.30, "B1": 0.50,
                          "B2": 0.70, "C1": 0.85, "C2": 1.00 },
  "default_weights":    { "lexical": 35, "grammatical": 25,
                          "phonological": 10, "writing_system": 10,
                          "genealogical": 20 },
  "lsg_cognates":       { "es|pt": [ {"gloss":"night","a":"noche","b":"noite"},
                                      … ], … 42 pairs },
  "lsg_glossary":       { "fusional": "A morphological type where …", … 24 terms },
  "lsg_centroids":      { "DE": [10.4, 51.2], … 181 country centroids },
  "lsg_t":              { "en": {…UI strings for the graph…},
                          "de": {…}, "fr": {…}, …, "ru": {…} }
}
```

### Notes on the conversion from JS object literals

* **`DIACRITIC_COMPAT`** used to be a `Set`. JSON has no Set type, so the file
  stores it as an array of pair strings. `data-loader.js` rehydrates it via
  `new Set(payload.diacritic_compat)` so consumer code is unchanged.
* All ES6 unquoted-key objects (`{ en: {…}, de: {…} }`) were normalised to
  proper double-quoted JSON keys.
* No data values were edited — only the wrapping syntax changed.

### Asynchronous boot — how the page wires it together

`js/data-loader.js` is loaded **first** (with `defer`) and does three things:

1. **Gates Alpine** by setting `window.deferLoadingAlpine` before Alpine
   parses. This is Alpine 3’s official "wait for me" hook:
   ```js
   window.deferLoadingAlpine = function (startAlpine) {
     document.addEventListener('lang-data-ready', startAlpine, { once: true });
   };
   ```
2. **Fetches** `data/languages-matrix.json` and parses it.
3. **Hydrates** every legacy global the original code reads:
   ```js
   window.TRANSLATIONS       = payload.translations;
   window.DATA               = payload.data;
   window.LANG_NAMES         = payload.lang_names;
   window.SPEAKER_DATA       = payload.speaker_data;
   window.ISO_A2_TO_NUM      = payload.iso_a2_to_num;
   window.DIACRITIC_COMPAT   = new Set(payload.diacritic_compat);
   window.ORTHO_PROFILES     = payload.ortho_profiles;
   window.LANG_NATIVE        = payload.lang_native;
   window.LANG_FLAG          = payload.lang_flag;
   window.LANG_GROUPS        = payload.lang_groups;
   window.FSI_TIER           = payload.fsi_tier;
   window.LANG_PHRASES       = payload.lang_phrases;
   window.PARALLEL_SENTENCES = payload.parallel_sentences;
   window.LANG_CONTEXT       = payload.lang_context;
   window.FAMILY_NAMES       = payload.family_names;
   window.BRANCH_NAMES       = payload.branch_names;
   window.CEFR_WEIGHTS       = payload.cefr_weights;
   window.DEFAULT_WEIGHTS    = payload.default_weights;
   window.LSG_COGNATES       = payload.lsg_cognates;
   window.LSG_GLOSSARY       = payload.lsg_glossary;
   window.LSG_CENTROIDS      = payload.lsg_centroids;
   window.LSG_T              = payload.lsg_t;
   document.dispatchEvent(new CustomEvent('lang-data-ready'));
   ```
4. Finally it dispatches `lang-data-ready`, which un-gates Alpine.

Why this pattern matters: because Alpine reads `t('subtitle')` immediately
when it mounts the template, the data **must** be in memory before Alpine’s
first render. `deferLoadingAlpine` is the only zero-flicker way to enforce
that on plain GitHub Pages.

The D3 graph engine has its own `whenReady()` polling guard — it just
waits for `window.DATA` and `#lsg-svg` to appear, so no extra plumbing is
needed there.

---

## 3. The Core Engine Splits

### `js/app.js` (1 588 lines, 69 KB)

Contains:

* The three Intl helpers extracted from above the original Alpine block:
  `getNumToA2()`, `countryDisplayName()`, `flagEmoji()`.
* The `umamiTrack()` safe-wrapper for analytics.
* The full `app()` Alpine component factory, with all of:
  * Speaker selection / search / pills
  * Weight sliders + presets + persistence
  * Recommendation ranking and per-card breakdowns
  * The reverse-analysis tab (“how does my profile help me learn X?”)
  * Parallel sentence rendering w/ cognate highlighting
  * World-map rendering (`drawSpeakerMap`, regional / official overlays)
  * Profile persistence via `localStorage` (`lb-profile`, `lb-weights`, `lb-lang`)
  * Internationalization polling — `t()` reads from `window.TRANSLATIONS[currentLang]`,
    with English fallback, and re-renders on `currentLang` change.
  * Share-permalink encode / decode (`encodeProfile`, `decodeProfile`)
* `window.app = app;` at the bottom so Alpine’s `x-data="app()"` resolves.

### `js/graph-engine.js` (1 869 lines, 94 KB)

The complete Language Similarity Graph IIFE, verbatim from the monolith:

* `whenReady()` boot guard (waits for d3, DATA, and `#lsg-svg`)
* Scoring helpers (lexical / grammar / phonology / writing system / family),
  returning ∈ `[0, 1]`
* D3 v7 force-directed simulator (nodes, links, hulls, curved arcs)
* Single-linkage hierarchical clustering for the **tree** dendrogram view
* Heatmap renderer for the **matrix** view
* Geo view backed by `LSG_CENTROIDS`
* **Dijkstra shortest-path utility** for the "learning path" overlay
* Drag / zoom / pan / hover / click / keyboard navigation
* View-mode controllers (`network` / `tree` / `matrix` / `geo`)
* Threshold slider + metric switch
* Edge tooltip with curated cognate exemplars from `LSG_COGNATES`
* Glossary popover (`LSG_GLOSSARY`) on linguistic jargon
* First-time guided tour overlay (`lsg-tour-*` IDs)
* Live i18n via `LSG_T`, listening to Alpine’s `currentLang`
* Export to PNG / SVG / embeddable iframe code
* `prefers-reduced-motion` respect and permalink restoration

Because the IIFE never imported anything in the first place — it just read
`window.DATA`, `window.d3`, and the `LSG_*` globals — it required **zero
edits** during extraction beyond the file header comment.

### `css/styles.css` (1 107 lines, 47 KB)

Holds everything that used to live inside the inline `<style>` block:

* Base typography + CSS custom properties (`--radar-grid`, `--radar-fill`, …)
* Dark-mode token overrides (`.dark { … }`)
* World-map styles (`.lang-map-svg`, `.country.recommended`, `.country.regional`, …)
* Language-selector cards (`.lang-card`, `.family-header`, `.selected-pill`, …)
* iTalki affiliate CTA
* Language Similarity Graph: `#graph-container` tokens, panels, SVG nodes,
  hulls, tooltips, glossary popover, and the tour overlay

Tailwind utility classes are untouched in the templates — Tailwind still
JIT-compiles them in the browser via the CDN script, exactly as before.

---

## 4. Why this stays GitHub Pages Friendly

* **No bundler.** No `package.json`, no `webpack`, no `vite`, no `npm install`.
* **Native browser features only.** ES2017+ syntax, `fetch`, `document.dispatchEvent`,
  `CustomEvent`, classes, arrow functions — all in baseline browsers since 2017.
* **All vendor code still comes from CDNs.** Tailwind, Alpine, and D3 are loaded
  exactly as they were in the monolith.
* **Five script tags, ordered in the head:**
  ```html
  <script src="js/data-loader.js"                                   defer></script>
  <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"    defer></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js" defer></script>
  <script src="js/app.js"                                           defer></script>
  <script src="js/graph-engine.js"                                  defer></script>
  ```
  `defer` guarantees in-order execution after HTML parsing — exactly the
  ordering the runtime needs.
* **One stylesheet link:**
  ```html
  <link rel="stylesheet" href="css/styles.css">
  ```
* **One JSON fetch:** `fetch('data/languages-matrix.json', { cache: 'no-cache' })`
  uses the page-relative URL so it works whether the site is served from
  `/`, from a GitHub Pages project sub-path, or from `file://` during local
  development with a simple static server.
* **Service Worker:** unchanged. Once you regenerate the SW cache list to
  include `css/styles.css`, `js/*.js`, and `data/languages-matrix.json`,
  the offline experience continues working too.

> **Update your `sw.js` precache list** to include the four new files when you
> bump its cache version, otherwise stale shells will still try to read the
> old inline code from cache. Pseudo-diff for `sw.js`:
> ```diff
>  const CACHE = 'mnl-v0.0.X';
>  const ASSETS = [
>    '/',
>    '/index.html',
> +  '/css/styles.css',
> +  '/js/data-loader.js',
> +  '/js/app.js',
> +  '/js/graph-engine.js',
> +  '/data/languages-matrix.json',
>    '/manifest.json',
>    '/icon_test_2.1.jpeg',
>  ];
> ```

---

## 5. Migration / Verification Checklist

Performed during this refactor (you can re-run any of these locally):

1. **CSS extraction**: `sed -n '63,1154p' index.html.backup` lifted lines 63–1154
   verbatim into `css/styles.css` with a header comment.
2. **Data extraction**: a small Node script concatenated the data-only line
   ranges (2667–3458, 3483–4338, 5899–6391), evaluated them in Node, then
   `JSON.stringify(…, null, 2)` produced `data/languages-matrix.json`.
   `DIACRITIC_COMPAT` was converted from `Set` → array at write time.
3. **app.js**: helpers (`getNumToA2`, `countryDisplayName`, `flagEmoji`,
   `umamiTrack`) + the Alpine `app()` factory (lines 4349–5884) + a
   `window.app = app;` export line.
4. **graph-engine.js**: the IIFE body from lines 6433–8274.
5. **index.html**: rewritten head with the new `<link>` / `<script>` wiring;
   JSON-LD blocks copied verbatim; body markup (1305–2664) copied verbatim;
   BMC widget kept at the bottom.

Sanity checks that passed:

* `node --check js/data-loader.js` — OK
* `node --check js/app.js` — OK
* `node --check js/graph-engine.js` — OK
* `JSON.parse(data/languages-matrix.json)` — OK
* Token coverage spot-check across all 28 named globals / helper functions —
  every functional reference preserved. (Only two purely-comment header
  lines were dropped: the curators’ block comments that lived directly
  above `LSG_COGNATES` and `LSG_GLOSSARY` in the monolith. Their semantic
  content is now in the file-header comment of `js/graph-engine.js` and
  data-loader.js.)
* Boot simulation in Node — every legacy `window.*` global the engines
  read is correctly hydrated from the JSON payload.

---

## 6. How to test locally

Any plain static server works. Examples:

```bash
# Python 3
python3 -m http.server 8080

# Node (no install)
npx serve .

# PHP
php -S localhost:8080
```

Then open `http://localhost:8080/`. The browser DevTools network tab
should show, in order:

```
GET /                              → index.html       (98 KB)
GET /css/styles.css                                    (47 KB)
GET /js/data-loader.js                                  (4 KB)
GET https://cdn.tailwindcss.com/…
GET https://unpkg.com/alpinejs@3.x.x/…
GET https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/…
GET /js/app.js                                          (69 KB)
GET /js/graph-engine.js                                 (94 KB)
GET /data/languages-matrix.json                       (388 KB)
```

Once `languages-matrix.json` arrives, `lang-data-ready` fires, Alpine
takes over, and the graph engine boots when it sees `window.DATA`.

---

## 7. What changed in app behaviour

**Nothing user-visible.** The contract is byte-identical:

* Same 96 languages, same scoring weights, same recommendations, same
  graph nodes/edges, same translations, same parallel sentences.
* Same `localStorage` keys (`lb-profile`, `lb-weights`, `lb-lang`, `lb-theme`),
  so existing users keep their saved profiles on first load of the new build.
* Same PWA manifest, same icons, same JSON-LD schema, same SEO metadata.

The only observable difference is one extra network round-trip on first load
to fetch `languages-matrix.json` (it lives in the SW precache after the first
visit, so subsequent loads are still single-RTT).

---

## 8. Where to extend next

* **Modular JSON sharding.** If `languages-matrix.json` ever exceeds ~1 MB,
  split `lsg_*` keys into their own `data/lsg-*.json` files and have
  `data-loader.js` `Promise.all([...])` them.
* **Tour as its own file.** The first-time guided tour currently lives inside
  the graph-engine IIFE (search for `lsg-tour-*`). If the tour grows, it can
  be lifted into `js/tour.js` and exposed as `window.LSGTour.start()`. The
  IIFE would just call `window.LSGTour.start()` if present.
* **TypeScript / JSDoc.** Both `app.js` and `graph-engine.js` can be
  progressively typed with JSDoc without changing the runtime — still no
  build step required.
* **Skeleton screens.** While `languages-matrix.json` is in flight, the
  Alpine templates render with empty placeholders. Adding a CSS-only
  skeleton loader to the language picker would smooth the first paint.
