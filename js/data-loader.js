/* ============================================================================
 * MyNextLanguage.org — data-loader.js
 * ----------------------------------------------------------------------------
 * Responsibilities:
 *   1. Fetch /data/languages-matrix.json (with path-fallbacks for sub-paths
 *      and a friendly diagnostic for file:// users).
 *   2. Mirror every payload key onto window.* under the SAME names the
 *      original monolithic index.html used (TRANSLATIONS, DATA, LSG_T, …),
 *      so app.js / graph-engine.js need zero code changes.
 *   3. Inject Alpine.js once BOTH the data is hydrated AND window.app has
 *      been defined by app.js. Alpine v3 auto-starts on load and offers no
 *      `deferLoadingAlpine` hook, so the only reliable way to gate it is to
 *      delay its <script> tag's insertion.
 *
 * The graph engine has its own whenReady() polling guard — it just waits
 * for window.DATA and #lsg-svg to appear, so no extra plumbing is needed.
 * ========================================================================== */
(function () {
  'use strict';

  var ALPINE_SRC = 'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js';
  var alpineInjected = false;

  /** Insert the Alpine CDN <script> tag. Called once data + app are ready. */
  function injectAlpine() {
    if (alpineInjected) return;
    alpineInjected = true;
    var s = document.createElement('script');
    s.src = ALPINE_SRC;
    s.defer = true;
    s.onload  = function () { console.log('[MyNextLanguage] Alpine.js injected and started.'); };
    s.onerror = function () { console.error('[MyNextLanguage] Failed to load Alpine.js from ' + ALPINE_SRC); };
    document.head.appendChild(s);
  }

  /** Poll until BOTH data hydration AND app.js are ready, then inject Alpine. */
  function tryStartAlpine() {
    var tries = 0;
    function attempt() {
      if (window.__langDataReady && typeof window.app === 'function') {
        injectAlpine();
        return;
      }
      if (++tries > 400) {
        console.error('[MyNextLanguage] Gate timed out waiting for data + app — '
          + '__langDataReady=' + window.__langDataReady
          + ', typeof window.app=' + (typeof window.app));
        return;
      }
      setTimeout(attempt, 25);
    }
    // Wait for DOMContentLoaded so every deferred sibling script
    // (notably app.js) has executed.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attempt, { once: true });
    } else {
      setTimeout(attempt, 0);
    }
  }

  // ── 1. file:// detection ─────────────────────────────────────────────────
  var isFile = location.protocol === 'file:';

  // ── 2. Path fallbacks so the same code works at "/" or any sub-path ──────
  var CANDIDATES = [
    'data/languages-matrix.json',
    './data/languages-matrix.json',
    '/data/languages-matrix.json'
  ];

  function tryFetch(i) {
    if (i >= CANDIDATES.length) {
      return Promise.reject(new Error('No candidate path resolved'));
    }
    return fetch(CANDIDATES[i], { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) {
        if (i + 1 < CANDIDATES.length) return tryFetch(i + 1);
        throw new Error('HTTP ' + res.status + ' from ' + CANDIDATES[i]);
      }
      console.log('[MyNextLanguage] Loaded data from', CANDIDATES[i]);
      return res.json();
    }).catch(function (err) {
      if (i + 1 < CANDIDATES.length) return tryFetch(i + 1);
      throw err;
    });
  }

  // ── 3. Fetch + hydrate ───────────────────────────────────────────────────
  window.__langDataReady = false;

  (isFile
    ? Promise.reject(new Error('Page opened via file:// — fetch() is blocked '
        + 'on file URLs. Serve the folder with a tiny static HTTP server.'))
    : tryFetch(0)
  )
    .then(function (payload) {
      window.LANG_DATA = payload;

      // Mirror to the legacy global names used throughout app.js / graph-engine.js.
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

      window.__langDataReady = true;
      document.dispatchEvent(new CustomEvent('lang-data-ready'));

      console.log('[MyNextLanguage] Data hydrated — '
        + Object.keys(payload.data.languages).length + ' languages, '
        + Object.keys(payload.translations).length + ' UI locales.');
    })
    .catch(function (err) {
      console.error('[MyNextLanguage] Failed to load language matrix:', err);

      var hint = isFile
        ? 'You opened index.html directly from disk (file://). Browsers block '
          + 'fetch() on file URLs for security. Run a tiny local HTTP server '
          + 'from this folder, e.g.:<br><br>'
          + '<code style="display:block;background:#1c1917;color:#a7f3d0;'
          + 'padding:10px 14px;border-radius:6px;text-align:left;'
          + 'font-family:ui-monospace,monospace;font-size:0.85rem;'
          + 'line-height:1.7">'
          + '$ python -m http.server 8080<br>'
          + '$ npx serve .<br>'
          + '$ php -S localhost:8080'
          + '</code><br>then open <strong>http://localhost:8080/</strong>'
        : 'Check the browser console (F12) for the precise reason. Common '
          + 'causes: the file is missing at <code>data/languages-matrix.json</code>, '
          + 'a 404 from your server, or a CORS / mixed-content block.';

      var render = function () {
        var msg = document.createElement('div');
        msg.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;'
          + 'background:#0c0a09;color:#fca5a5;font-family:system-ui;padding:24px;'
          + 'text-align:center;z-index:99999;overflow:auto';
        msg.innerHTML = '<div style="max-width:560px">'
          + '<h1 style="font-size:1.25rem;margin-bottom:10px;color:#fca5a5">'
          + 'Could not load language data.</h1>'
          + '<p style="opacity:.85;font-size:0.92rem;line-height:1.5">' + hint + '</p>'
          + '<p style="opacity:.55;font-size:0.78rem;margin-top:14px;'
          + 'font-family:ui-monospace,monospace">' + String(err.message || err) + '</p>'
          + '</div>';
        document.body.appendChild(msg);
      };
      if (document.body) render();
      else document.addEventListener('DOMContentLoaded', render, { once: true });
    });

  // ── 4. Kick off the Alpine-injection poll. ───────────────────────────────
  tryStartAlpine();
})();
