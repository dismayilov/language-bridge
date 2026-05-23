/* ============================================================================
 * MyNextLanguage.org — graph-engine.js
 * ----------------------------------------------------------------------------
 * Self-contained Language Similarity Graph engine.
 *
 *   • D3.js v7 force-directed simulator (network view)
 *   • Hierarchical (single-linkage) dendrogram (tree view)
 *   • Heatmap matrix view
 *   • Geo view backed by LSG_CENTROIDS (country lat/lon)
 *   • Dijkstra shortest-path utility ("how do I get from X to Y")
 *   • Cluster hulls & curved cross-family arcs
 *   • Drag / zoom / pan / hover / click / keyboard nav
 *   • View-mode controller, threshold slider, metric switch
 *   • Edge tooltip with curated cognate exemplars (LSG_COGNATES)
 *   • Glossary popover on linguistic terms (LSG_GLOSSARY)
 *   • First-time guided tour overlay (handled inline in the IIFE — search
 *     for "tour" / "lsg-tour" to find the helpers)
 *   • i18n via LSG_T (currentLang synced from Alpine)
 *   • Export to PNG / SVG / embeddable iframe code
 *   • Reduced-motion + permalink support
 *
 * Boots via internal `whenReady()` polling guard once these globals exist:
 *   window.d3, window.DATA, window.LSG_*, and #lsg-svg in the DOM.
 * The IIFE is preserved verbatim from the monolithic index.html so behaviour
 * stays bit-for-bit identical.
 * ========================================================================== */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
     0. Boot guard
     ═════════════════════════════════════════════════════════════════════ */
  function whenReady(fn) {
    var tries = 0;
    function attempt() {
      tries++;
      var ok = typeof window.d3 !== 'undefined' &&
               (document.readyState === 'interactive' || document.readyState === 'complete') &&
               typeof DATA !== 'undefined' && DATA && DATA.languages &&
               document.getElementById('lsg-svg');
      if (ok) { fn(); return; }
      if (tries > 200) { console.warn('[LangGraph] gave up'); return; }
      setTimeout(attempt, 50);
    }
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', attempt, { once: true });
    else attempt();
  }
  // NOTE: defer the kickoff by one macrotask. In the original monolithic
  // index.html this IIFE ran while document.readyState was still 'loading',
  // so whenReady() always waited for DOMContentLoaded — by which time every
  // `var` and `function` declaration below had been evaluated. With
  // <script defer> we now start in readyState === 'interactive', and
  // whenReady() can fire fn() synchronously — *before* `var DW = {…}` at
  // line ~55 has been assigned, leaving DW === undefined and the very first
  // composite() call throwing "Cannot read properties of undefined (reading
  // 'lexical')". A 0-ms setTimeout pushes the kickoff to the next macrotask,
  // by which point the entire IIFE body has executed.
  setTimeout(function () {
    whenReady(function () { initLangGraph(window.d3, DATA); });
  }, 0);

  /* ═══════════════════════════════════════════════════════════════════════
     1. Scoring — pure functions, returning ∈ [0,1] (1 = identical)
     ═════════════════════════════════════════════════════════════════════ */
  var DW = { lexical: 35, grammatical: 25, phonological: 10, writing_system: 10, genealogical: 20 };
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function isLexCurated(D, a, b) { return D.lexical[pairKey(a, b)] !== undefined; }

  function simLexical(D, a, b) {
    if (a === b) return 1;
    var k = pairKey(a, b);
    if (D.lexical[k] !== undefined) return D.lexical[k];
    var la = D.languages[a], lb = D.languages[b];
    if (la.family    !== lb.family)    return 0.03;
    if (la.branch    !== lb.branch)    return 0.10;
    if (la.subbranch !== lb.subbranch) return 0.30;
    return 0.55;
  }
  function simGenealogical(D, a, b) {
    var la = D.languages[a], lb = D.languages[b];
    if (la.family    !== lb.family)    return 0;
    if (la.branch    !== lb.branch)    return 0.4;
    if (la.subbranch !== lb.subbranch) return 0.7;
    return 1;
  }
  function simWordOrder(la, lb) {
    var fam = { 'SVO':['SVO'], 'V2':['V2','SVO'], 'SOV':['SOV'], 'VSO':['VSO'],
                'SVO(free)':['SVO(free)','SVO'], 'SOV(free)':['SOV(free)','SOV'],
                'topic-focus(free)':['topic-focus(free)','SVO(free)','SVO'] };
    if (la.word_order === lb.word_order) return 1;
    if ((fam[la.word_order] || []).indexOf(lb.word_order) > -1) return 0.7;
    if ((fam[lb.word_order] || []).indexOf(la.word_order) > -1) return 0.7;
    return 0;
  }
  function simMorph(la, lb) {
    if (la.morphology === lb.morphology) return 1;
    var p = { 'analytic|analytic-fusional':0.8, 'fusional|analytic-fusional':0.8,
              'analytic|fusional':0.3, 'fusional|agglutinative':0.2,
              'analytic|agglutinative':0.1, 'analytic-fusional|agglutinative':0.15,
              'analytic|analytic-agglutinative':0.4, 'agglutinative|analytic-agglutinative':0.6 };
    return p[[la.morphology, lb.morphology].sort().join('|')] || 0;
  }
  function simGrammatical(D, a, b) {
    var la = D.languages[a], lb = D.languages[b];
    var cs = Math.max(0, 1 - Math.abs((la.case_count||0)   - (lb.case_count||0))   / 8);
    var gs = Math.max(0, 1 - Math.abs((la.gender_count||0) - (lb.gender_count||0)) / 3);
    var as = (la.articles === lb.articles) ? 1 :
             (la.articles !== 'none' && lb.articles !== 'none' ? 0.5 : 0.2);
    return (cs + gs + as + simWordOrder(la, lb) + simMorph(la, lb) +
            (la.vowel_harmony === lb.vowel_harmony ? 1 : 0)) / 6;
  }
  function simPhonological(D, a, b) {
    var pa = new Set(D.languages[a].phoneme_features || []);
    var pb = new Set(D.languages[b].phoneme_features || []);
    if (pa.size === 0 && pb.size === 0) return 1;
    var inter = 0; pa.forEach(function (x) { if (pb.has(x)) inter++; });
    var u = pa.size + pb.size - inter; return u === 0 ? 0 : inter / u;
  }
  function scriptRoot(ws) {
    if (!ws) return '';
    var roots = ['Latin','Cyrillic','Arabic','Hebrew','Devanagari'];
    for (var i = 0; i < roots.length; i++) if (ws.indexOf(roots[i]) > -1) return roots[i];
    return ws;
  }
  function simWritingSystem(D, a, b) {
    var sa = D.languages[a].writing_system, sb = D.languages[b].writing_system;
    if (sa === sb) return 1;
    return scriptRoot(sa) === scriptRoot(sb) ? 0.4 : 0;
  }
  function contactSym(D, a, b) {
    var info = D.contact[a + '|' + b] || D.contact[b + '|' + a];
    return info ? info.bonus : 0;
  }
  function contactDir(D, from, to) {
    var info = D.contact[from + '|' + to];
    return info ? info.bonus : 0;
  }
  function simByMetric(D, metric, a, b, dir) {
    switch (metric) {
      case 'lexical': {
        var bonus = dir ? contactDir(D, a, b) : contactSym(D, a, b);
        return Math.min(1, simLexical(D, a, b) + bonus);
      }
      case 'grammatical':    return simGrammatical(D, a, b);
      case 'phonological':   return simPhonological(D, a, b);
      case 'writing_system': return simWritingSystem(D, a, b);
      case 'genealogical':   return simGenealogical(D, a, b);
    }
  }
  function composite(D, a, b, dir) {
    var w = DW;
    var lex  = simByMetric(D, 'lexical',        a, b, dir);
    var gen  = simByMetric(D, 'genealogical',   a, b, false);
    var gram = simByMetric(D, 'grammatical',    a, b, false);
    var phon = simByMetric(D, 'phonological',   a, b, false);
    var ws   = simByMetric(D, 'writing_system', a, b, false);
    var T = w.lexical + w.grammatical + w.phonological + w.writing_system + w.genealogical;
    return lex*(w.lexical/T) + gen*(w.genealogical/T) + gram*(w.grammatical/T) +
           phon*(w.phonological/T) + ws*(w.writing_system/T);
  }
  function distance(D, metric, a, b, dir) {
    if (a === b) return 0;
    var s = (metric === 'composite') ? composite(D, a, b, !!dir) : simByMetric(D, metric, a, b, !!dir);
    return 100 * (1 - s);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2. Hierarchical clustering (single-linkage) — used by Tree + Matrix views
     ═════════════════════════════════════════════════════════════════════ */
  function singleLinkageCluster(codes, distFn) {
    // returns root node {id, dist, children?, code?}
    var n = codes.length;
    var clusters = codes.map(function (c, i) {
      return { id: i, members: [i], leaf: true, code: c, dist: 0 };
    });
    var dm = [];
    for (var i = 0; i < n; i++) {
      dm[i] = [];
      for (var j = 0; j < n; j++) dm[i][j] = (i === j) ? 0 : distFn(codes[i], codes[j]);
    }
    var nextId = n;
    while (clusters.length > 1) {
      // Find closest pair
      var best = Infinity, bi = 0, bj = 1;
      for (var a = 0; a < clusters.length; a++) {
        for (var b = a + 1; b < clusters.length; b++) {
          var d = Infinity;
          var ma = clusters[a].members, mb = clusters[b].members;
          for (var u = 0; u < ma.length; u++)
            for (var v = 0; v < mb.length; v++)
              if (dm[ma[u]][mb[v]] < d) d = dm[ma[u]][mb[v]];
          if (d < best) { best = d; bi = a; bj = b; }
        }
      }
      var ca = clusters[bi], cb = clusters[bj];
      var merged = {
        id: nextId++, leaf: false, dist: best,
        children: [ca, cb],
        members: ca.members.concat(cb.members)
      };
      var next = [];
      for (var k = 0; k < clusters.length; k++)
        if (k !== bi && k !== bj) next.push(clusters[k]);
      next.push(merged);
      clusters = next;
    }
    return clusters[0];
  }
  /* Walk the tree, return leaves in left-right order */
  function leafOrder(root) {
    var out = [];
    (function walk(n) {
      if (n.leaf) { out.push(n.code); return; }
      walk(n.children[0]); walk(n.children[1]);
    })(root);
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3. Dijkstra — shortest path on the full pairwise graph
     ═════════════════════════════════════════════════════════════════════ */
  function dijkstra(codes, distFn, fromCode, toCode) {
    var n = codes.length;
    var idx = {}; codes.forEach(function (c, i) { idx[c] = i; });
    if (!(fromCode in idx) || !(toCode in idx)) return null;
    var src = idx[fromCode], dst = idx[toCode];
    var dist = new Array(n).fill(Infinity);
    var prev = new Array(n).fill(-1);
    var used = new Array(n).fill(false);
    dist[src] = 0;
    for (var step = 0; step < n; step++) {
      var u = -1, best = Infinity;
      for (var i = 0; i < n; i++) if (!used[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1 || u === dst) break;
      used[u] = true;
      for (var v = 0; v < n; v++) {
        if (used[v]) continue;
        var w = distFn(codes[u], codes[v]);
        if (w == null) continue;
        var alt = dist[u] + w;
        if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
      }
    }
    if (!isFinite(dist[dst])) return null;
    var path = []; for (var x = dst; x !== -1; x = prev[x]) path.unshift(codes[x]);
    return { path: path, totalDist: dist[dst] };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4. URL state
     ═════════════════════════════════════════════════════════════════════ */
  var URL_KEY = 'lsg';
  function readUrlState() {
    var hash = location.hash.replace(/^#/, ''); if (!hash) return {};
    var parts = hash.split('&');
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i], eq = seg.indexOf('=');
      if (eq < 0 || seg.slice(0, eq) !== URL_KEY) continue;
      var out = {};
      seg.slice(eq + 1).split(',').forEach(function (kv) {
        var p = kv.indexOf('=');
        if (p < 0) { if (kv.length > 1) out[kv[0]] = kv.slice(1); }
        else out[kv.slice(0, p)] = kv.slice(p + 1);
      });
      return out;
    }
    return {};
  }
  function writeUrlState(state) {
    var pieces = [];
    Object.keys(state).forEach(function (k) {
      var v = state[k]; if (v === null || v === undefined || v === '') return;
      pieces.push(k + '=' + encodeURIComponent(String(v)));
    });
    var ourSeg = pieces.length ? (URL_KEY + '=' + pieces.join(',')) : '';
    var hash = location.hash.replace(/^#/, '');
    var parts = hash ? hash.split('&').filter(function (p) {
      return p.indexOf(URL_KEY + '=') !== 0;
    }) : [];
    if (ourSeg) parts.push(ourSeg);
    var newHash = parts.length ? '#' + parts.join('&') : '';
    history.replaceState(null, '', location.pathname + location.search + newHash);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5. Alpine bridge
     ═════════════════════════════════════════════════════════════════════ */
  function getAlpineData() {
    if (!window.Alpine) return null;
    var el = document.querySelector('[x-data="app()"]'); if (!el) return null;
    try { return window.Alpine.$data(el); } catch (e) { return null; }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6. i18n — tt(key); applyI18n() updates [data-i18n*] elements
     ═════════════════════════════════════════════════════════════════════ */
  var currentUiLang = 'en';
  function tt(key) {
    var dict = (window.LSG_T && window.LSG_T[currentUiLang]) || window.LSG_T.en;
    var fallback = window.LSG_T && window.LSG_T.en;
    return (dict && dict[key]) || (fallback && fallback[key]) || key;
  }
  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var v = tt(key); if (v) el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var v = tt(key); if (v) el.title = v;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var v = tt(key); if (v) el.placeholder = v;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7. Main init
     ═════════════════════════════════════════════════════════════════════ */
  function initLangGraph(d3, D) {
    /* ── elements ───────────────────────────────────────────────────── */
    var container = document.getElementById('graph-container');
    var svgEl     = document.getElementById('lsg-svg');
    var wrap      = document.getElementById('lsg-canvas-wrap');
    var tipEl     = document.getElementById('lsg-tip');
    var tipName   = document.getElementById('lsg-tip-name');
    var tipMeta   = document.getElementById('lsg-tip-meta');
    var tipList   = document.getElementById('lsg-tip-list');
    var tipClose  = document.getElementById('lsg-tip-close');
    var tipActions= document.getElementById('lsg-tip-actions');
    var tipCompare= document.getElementById('lsg-tip-compare');
    var edgeTip   = document.getElementById('lsg-edge-tip');
    var legendEl  = document.getElementById('lsg-legend');
    var slider    = document.getElementById('lsg-threshold');
    var sliderVal = document.getElementById('lsg-threshold-val');
    var charge    = document.getElementById('lsg-charge');
    var resetBtn  = document.getElementById('lsg-reset-zoom');
    var copyBtn   = document.getElementById('lsg-copy-link');
    var copyToast = document.getElementById('lsg-copy-toast');
    var statNodes = document.getElementById('lsg-stat-nodes-val');
    var statLinks = document.getElementById('lsg-stat-links-val');
    var metricRow = document.querySelector('#graph-container .lsg-chip-row[aria-label="Distance metric"]');
    var searchInp = document.getElementById('lsg-search');
    var searchRes = document.getElementById('lsg-search-results');
    var learnInp  = document.getElementById('lsg-learning');
    var learnWrap = document.getElementById('lsg-learning-wrap');
    var viewRow   = document.getElementById('lsg-view-row');
    var pathFrom  = document.getElementById('lsg-path-from');
    var pathTo    = document.getElementById('lsg-path-to');
    var pathFind  = document.getElementById('lsg-path-find');
    var pathClear = document.getElementById('lsg-path-clear');
    var pathRes   = document.getElementById('lsg-path-result');
    var surprList = document.getElementById('lsg-surprising-list');
    var glossPop  = document.getElementById('lsg-gloss-popover');
    var glossPopT = document.getElementById('lsg-gloss-popover-title');
    var glossPopB = document.getElementById('lsg-gloss-popover-body');
    var exportBtn = document.getElementById('lsg-export-btn');
    var exportMenu= document.getElementById('lsg-export-menu');
    var helpBtn   = document.getElementById('lsg-help-btn');

    /* ── data ──────────────────────────────────────────────────────── */
    var codes = Object.keys(D.languages);
    var nodes = codes.map(function (c) {
      var l = D.languages[c];
      return { id: c, name: l.name, group: l.family || 'Other',
               branch: l.branch || '', subbranch: l.subbranch || '',
               speakers: l.speakers_m || 0 };
    });
    var nodeById = Object.create(null);
    nodes.forEach(function (n) { nodeById[n.id] = n; });
    var families = Array.from(new Set(nodes.map(function (n) { return n.group; }))).sort();

    /* ── colour scale ──────────────────────────────────────────────── */
    var palette = [
      '#34d399','#a78bfa','#60a5fa','#fbbf24','#f472b6','#22d3ee','#fb923c',
      '#a3e635','#f87171','#c084fc','#2dd4bf','#facc15','#e879f9','#38bdf8',
      '#fdba74','#bef264','#fb7185'
    ];
    var color = d3.scaleOrdinal().domain(families)
      .range(families.map(function (_, i) { return palette[i % palette.length]; }));
    var familyHidden = Object.create(null);
    function isVisibleNode(n) { return !familyHidden[n.group]; }

    /* ── state ─────────────────────────────────────────────────────── */
    var state = {
      view: 'network',     // network | tree | matrix | geo
      threshold: 45,
      metric: 'composite',
      learning: false,
      focusedId: null,
      pinnedId: null,
      pathFrom: null,
      pathTo: null,
      pathHighlight: []     // array of codes
    };
    var chargeStrength = -150;
    var prefersReducedMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ── URL state ─────────────────────────────────────────────────── */
    var urlState = readUrlState();
    if (urlState.v) state.view = urlState.v;
    if (urlState.t) { var ti = +urlState.t; if (ti >= 10 && ti <= 95) state.threshold = ti; }
    if (urlState.m) state.metric = urlState.m;
    if (urlState.n && urlState.n in nodeById) state.focusedId = urlState.n;
    if (urlState.L) state.learning = urlState.L === '1';
    slider.value = state.threshold;
    sliderVal.textContent = String(state.threshold);
    document.querySelectorAll('#graph-container .lsg-chip[data-metric]').forEach(function (c) {
      c.classList.toggle('is-active', c.dataset.metric === state.metric);
    });
    document.querySelectorAll('#graph-container .lsg-chip[data-view]').forEach(function (c) {
      c.classList.toggle('is-active', c.dataset.view === state.view);
    });

    /* ── sizing ────────────────────────────────────────────────────── */
    var svg = d3.select(svgEl);
    function dims() {
      var r = wrap.getBoundingClientRect();
      return { w: Math.max(320, r.width), h: Math.max(320, r.height) };
    }
    var W = dims().w, H = dims().h;
    svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('preserveAspectRatio', 'xMidYMid meet');

    /* ── Alpine-derived state ──────────────────────────────────────── */
    var userSpeakers = [];
    var userRecs = [];
    var lastAlpineKey = '';
    var alpineLastLang = '';

    /* ── pre-compute clustering + surprising connections (composite metric) */
    var leafOrderCache = null;
    var lastClusterMetric = null;
    function getLeafOrder(metric) {
      if (lastClusterMetric === metric && leafOrderCache) return leafOrderCache;
      var root = singleLinkageCluster(codes, function (a, b) {
        return distance(D, metric, a, b, false);
      });
      leafOrderCache = leafOrder(root);
      lastClusterMetric = metric;
      return leafOrderCache;
    }
    var clusterRootCache = null;
    var lastTreeMetric = null;
    function getClusterRoot(metric) {
      if (lastTreeMetric === metric && clusterRootCache) return clusterRootCache;
      clusterRootCache = singleLinkageCluster(codes, function (a, b) {
        return distance(D, metric, a, b, false);
      });
      lastTreeMetric = metric;
      return clusterRootCache;
    }

    /* surprising connections: cross-family pairs with smallest composite distance */
    function computeSurprising(maxN) {
      var pairs = [];
      for (var i = 0; i < codes.length; i++) for (var j = i + 1; j < codes.length; j++) {
        var a = codes[i], b = codes[j];
        var la = D.languages[a], lb = D.languages[b];
        if (la.family === lb.family) continue;
        if (la.family === 'Isolate' || lb.family === 'Isolate') continue;
        var dst = distance(D, 'composite', a, b, false);
        pairs.push({ a: a, b: b, dist: dst, famA: la.family, famB: lb.family });
      }
      pairs.sort(function (x, y) { return x.dist - y.dist; });
      return pairs.slice(0, maxN || 6);
    }
    var surprising = computeSurprising(6);

    /* ── populate path widget dropdowns ─────────────────────────────── */
    function fillPathDropdowns() {
      var sorted = codes.slice().sort(function (a, b) {
        return D.languages[a].name.localeCompare(D.languages[b].name);
      });
      [pathFrom, pathTo].forEach(function (sel) {
        sel.innerHTML = '';
        var placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = '—';
        sel.appendChild(placeholder);
        sorted.forEach(function (c) {
          var o = document.createElement('option');
          o.value = c; o.textContent = D.languages[c].name;
          sel.appendChild(o);
        });
      });
    }
    fillPathDropdowns();

    /* ── surprising panel render ────────────────────────────────────── */
    function renderSurprising() {
      surprList.innerHTML = '';
      surprising.forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'lsg-surprising-item';
        row.dataset.a = p.a; row.dataset.b = p.b;
        row.innerHTML =
          '<div>' +
            '<div class="lsg-surprising-pair">' +
              escapeHTML(D.languages[p.a].name) + ' ↔ ' + escapeHTML(D.languages[p.b].name) +
            '</div>' +
            '<div class="lsg-surprising-fams">' +
              escapeHTML(p.famA) + ' · ' + escapeHTML(p.famB) +
            '</div>' +
          '</div>' +
          '<div class="lsg-surprising-dist">' + p.dist.toFixed(0) + '</div>';
        row.addEventListener('click', function () {
          if (state.view !== 'network') {
            setView('network');
            setTimeout(function () { jumpTo(p.a); }, 200);
          } else {
            jumpTo(p.a);
          }
        });
        surprList.appendChild(row);
      });
    }
    renderSurprising();

    /* ── Network/Geo shared layers (created lazily inside initNetwork) ── */
    var net = {}; // { defs, rootG, hullLayer, linkLayer, nodeLayer, focusLayer, focusCircle, simulation, linkSel, nodeSel, hullSel, currentZoom, zoomBehaviour }

    /* ── node radius helper ─────────────────────────────────────────── */
    function nodeRadius(n) {
      var s = Math.max(1, n.speakers || 1);
      return 5 + Math.min(8, Math.log10(s + 1) * 3.6);
    }

    /* ═══════════════════════════════════════════════════════════════════
       NETWORK / GEO view
       ═════════════════════════════════════════════════════════════════ */
    var liveLinks = [];
    function rebuildLinks() {
      if (state.learning && userSpeakers.length) {
        var links = [];
        var spkSet = Object.create(null);
        userSpeakers.forEach(function (s) { spkSet[s] = true; });
        userSpeakers.forEach(function (from) {
          if (!(from in D.languages)) return;
          codes.forEach(function (to) {
            if (to === from || spkSet[to]) return;
            links.push({ source: from, target: to,
                         dist: distance(D, state.metric, from, to, true),
                         directed: true });
          });
        });
        liveLinks = links;
      } else {
        var links2 = [];
        for (var i = 0; i < codes.length; i++) for (var j = i + 1; j < codes.length; j++) {
          var a = codes[i], b = codes[j];
          links2.push({ source: a, target: b,
                        dist: distance(D, state.metric, a, b, false),
                        directed: false });
        }
        liveLinks = links2;
      }
    }

    function initNetworkLayer(isGeo) {
      svg.selectAll('*').remove();
      net.defs = svg.append('defs');
      net.defs.append('marker').attr('id', 'lsg-arrow')
        .attr('viewBox', '0 0 10 10').attr('refX', 8).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0,0 L10,5 L0,10 z').attr('fill', 'var(--lsg-link-hi)');

      net.rootG     = svg.append('g').attr('class', 'lsg-root');
      // Geographic grid as a background (only in geo mode)
      if (isGeo) drawGeoGrid(net.rootG);
      net.hullLayer = net.rootG.append('g').attr('class', 'lsg-hulls');
      net.linkLayer = net.rootG.append('g').attr('class', 'lsg-links');
      var pathLayer = net.rootG.append('g').attr('class', 'lsg-path-overlay');
      net.pathLayer = pathLayer;
      net.nodeLayer = net.rootG.append('g').attr('class', 'lsg-nodes');
      net.focusLayer= net.rootG.append('g').attr('class', 'lsg-focus-ring');

      net.currentZoom = d3.zoomIdentity;
      net.zoomBehaviour = d3.zoom()
        .scaleExtent([0.25, 6])
        .filter(function (event) {
          if (event.type === 'wheel') return true;
          if (event.type === 'mousedown' && event.target && event.target.closest('.lsg-node')) return false;
          if (event.type === 'touchstart' && event.target && event.target.closest('.lsg-node')) return false;
          return true;
        })
        .on('zoom', function (event) {
          net.currentZoom = event.transform;
          net.rootG.attr('transform', event.transform);
          applyLabelVisibility();
          scheduleUrlSync();
        });
      svg.call(net.zoomBehaviour);
      svg.on('dblclick.zoom', null);
      svg.on('click', function (event) {
        if (event.target === svgEl || event.target === net.rootG.node() ||
            event.target.classList.contains('lsg-hull')) closeTip();
      });

      // Restore zoom transform from URL only in network view
      if (!isGeo && (urlState.k || urlState.x || urlState.y)) {
        var k = parseFloat(urlState.k) || 1;
        var x = parseFloat(urlState.x) || 0;
        var y = parseFloat(urlState.y) || 0;
        var t = d3.zoomIdentity.translate(x, y).scale(k);
        requestAnimationFrame(function () { svg.call(net.zoomBehaviour.transform, t); });
      }
      net.focusCircle = net.focusLayer.append('circle').attr('class', 'lsg-focus-ring-circle')
        .attr('r', 0).attr('fill', 'none').attr('stroke', 'var(--lsg-accent-2)')
        .attr('stroke-width', 2.5).attr('stroke-dasharray', '4,3')
        .style('display', 'none').style('pointer-events', 'none');

      // Force sim or static layout
      if (isGeo) {
        applyGeoLayout();
        net.simulation = d3.forceSimulation(nodes)
          .force('link', d3.forceLink([]).id(function (d) { return d.id; }))
          .stop();
      } else if (prefersReducedMotion) {
        applyStaticLayout();
        net.simulation = d3.forceSimulation(nodes)
          .force('link', d3.forceLink([]).id(function (d) { return d.id; }))
          .stop();
      } else {
        net.simulation = d3.forceSimulation(nodes)
          .force('charge', d3.forceManyBody().strength(chargeStrength))
          .force('center', d3.forceCenter(W / 2, H / 2))
          .force('collide', d3.forceCollide().radius(function (d) { return nodeRadius(d) + 2; }))
          .force('x', d3.forceX(W / 2).strength(0.03))
          .force('y', d3.forceY(H / 2).strength(0.03))
          .force('link', d3.forceLink([]).id(function (d) { return d.id; })
                  .distance(function (l) { return 30 + l.dist * 1.4; })
                  .strength(function (l) { return 0.4 * (1 - l.dist / 100); }))
          .on('tick', onNetTick);
      }
      net.linkSel = net.linkLayer.selectAll('g.lsg-link-g');
      net.nodeSel = net.nodeLayer.selectAll('g.lsg-node');
      net.hullSel = net.hullLayer.selectAll('path.lsg-hull');
      renderNet();
    }

    function applyStaticLayout() {
      var cx = W / 2, cy = H / 2;
      var Rmajor = Math.min(W, H) * 0.32;
      var nodesByFam = {}; families.forEach(function (f) { nodesByFam[f] = []; });
      nodes.forEach(function (n) { nodesByFam[n.group].push(n); });
      families.forEach(function (fam, fi) {
        var angle = (fi / families.length) * Math.PI * 2 - Math.PI / 2;
        var fcx = cx + Math.cos(angle) * Rmajor;
        var fcy = cy + Math.sin(angle) * Rmajor;
        var members = nodesByFam[fam];
        var Rminor = Math.max(22, 7 * Math.sqrt(members.length));
        members.forEach(function (n, i) {
          var a = (i / Math.max(1, members.length)) * Math.PI * 2;
          n.x = fcx + Math.cos(a) * Rminor; n.y = fcy + Math.sin(a) * Rminor;
          n.fx = n.x; n.fy = n.y;
        });
      });
    }
    function applyGeoLayout() {
      // Pin each node to its primary country centroid via equirectangular proj
      // Map x: lng [-180..180] → [40..W-40]
      // Map y: lat [85..-60] → [40..H-40] (clipped to populated area)
      var padX = 40, padY = 60;
      var sd = window.SPEAKER_DATA || {};
      nodes.forEach(function (n) {
        var off = (sd[n.id] && sd[n.id].official) || [];
        var iso = off[0];
        var c = (window.LSG_CENTROIDS || {})[iso];
        if (!c) { // fall back: random near centre
          n.x = W/2 + (Math.random() - 0.5) * 100;
          n.y = H/2 + (Math.random() - 0.5) * 100;
        } else {
          var lat = c[0], lng = c[1];
          n.x = padX + (lng + 180) / 360 * (W - 2 * padX);
          n.y = padY + (85 - lat) / 145 * (H - 2 * padY);
        }
        n.fx = n.x; n.fy = n.y;
      });
    }
    function drawGeoGrid(g) {
      // Subtle latitude/longitude lines
      var padX = 40, padY = 60;
      for (var lng = -180; lng <= 180; lng += 30) {
        var x = padX + (lng + 180) / 360 * (W - 2 * padX);
        g.append('line').attr('class', 'lsg-geo-grid')
          .attr('x1', x).attr('y1', padY).attr('x2', x).attr('y2', H - padY);
        if (lng % 90 === 0) {
          g.append('text').attr('class', 'lsg-geo-label')
            .attr('x', x).attr('y', padY - 4).attr('text-anchor', 'middle')
            .text(lng + '°');
        }
      }
      for (var lat = -60; lat <= 80; lat += 30) {
        var y = padY + (85 - lat) / 145 * (H - 2 * padY);
        g.append('line').attr('class', 'lsg-geo-grid')
          .attr('x1', padX).attr('y1', y).attr('x2', W - padX).attr('y2', y);
        g.append('text').attr('class', 'lsg-geo-label')
          .attr('x', padX - 4).attr('y', y).attr('text-anchor', 'end').attr('dy', '0.3em')
          .text(lat + '°');
      }
      // Prime meridian + equator highlighted
      var xPM = padX + (0 + 180) / 360 * (W - 2 * padX);
      var yEQ = padY + (85 - 0) / 145 * (H - 2 * padY);
      g.append('line').attr('class', 'lsg-geo-pm')
        .attr('x1', xPM).attr('y1', padY).attr('x2', xPM).attr('y2', H - padY);
      g.append('line').attr('class', 'lsg-geo-eq')
        .attr('x1', padX).attr('y1', yEQ).attr('x2', W - padX).attr('y2', yEQ);
    }

    /* degree map for hub labels */
    var degreeMap = Object.create(null);
    function recomputeDegrees() {
      degreeMap = Object.create(null);
      liveLinks.forEach(function (l) {
        if (l.dist >= state.threshold) return;
        var s = (typeof l.source === 'object') ? l.source.id : l.source;
        var t = (typeof l.target === 'object') ? l.target.id : l.target;
        var sn = nodeById[s], tn = nodeById[t];
        if (!sn || !tn) return;
        if (!isVisibleNode(sn) || !isVisibleNode(tn)) return;
        degreeMap[s] = (degreeMap[s] || 0) + 1;
        degreeMap[t] = (degreeMap[t] || 0) + 1;
      });
    }
    function hubSetForZoom() {
      var k = (net.currentZoom && net.currentZoom.k) || 1;
      if (k > 1.4 || state.view === 'geo') return null;
      var top = Object.keys(degreeMap)
        .sort(function (a, b) { return degreeMap[b] - degreeMap[a]; }).slice(0, 12);
      var s = Object.create(null);
      top.forEach(function (id) { s[id] = true; });
      return s;
    }
    function applyLabelVisibility() {
      if (!net.nodeSel) return;
      var hubs = hubSetForZoom();
      svg.classed('lsg-labels-all', hubs === null);
      if (hubs !== null) net.nodeSel.classed('is-hub', function (n) { return !!hubs[n.id]; });
      else               net.nodeSel.classed('is-hub', false);
    }

    function renderNet() {
      var visibleNodes = nodes.filter(isVisibleNode);
      var visibleLinks = liveLinks.filter(function (l) {
        if (l.dist >= state.threshold) return false;
        var s = (typeof l.source === 'object') ? l.source.id : l.source;
        var t = (typeof l.target === 'object') ? l.target.id : l.target;
        var sn = nodeById[s], tn = nodeById[t];
        return sn && tn && isVisibleNode(sn) && isVisibleNode(tn);
      });

      // LINKS
      net.linkSel = net.linkLayer.selectAll('g.lsg-link-g').data(visibleLinks, function (l) {
        var s = (typeof l.source === 'object') ? l.source.id : l.source;
        var t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s + (l.directed ? '→' : '~') + t;
      });
      net.linkSel.exit().remove();
      var linkEnter = net.linkSel.enter().append('g').attr('class', 'lsg-link-g');
      linkEnter.append('path').attr('class', 'lsg-link-hit');
      linkEnter.append('path').attr('class', 'lsg-link');
      net.linkSel = linkEnter.merge(net.linkSel);
      net.linkSel.select('path.lsg-link')
        .attr('stroke', 'var(--lsg-link)')
        .attr('stroke-width', function (l) { return 0.6 + (1 - l.dist / state.threshold) * 3.2; })
        .attr('stroke-opacity', function (l) { return 0.15 + (1 - l.dist / state.threshold) * 0.7; })
        .attr('marker-end', function (l) { return l.directed ? 'url(#lsg-arrow)' : null; });
      net.linkSel.select('path.lsg-link-hit')
        .on('mouseenter', onEdgeHover).on('mouseleave', onEdgeLeave).on('mousemove', onEdgeMove);

      // NODES
      net.nodeSel = net.nodeLayer.selectAll('g.lsg-node').data(visibleNodes, function (d) { return d.id; });
      net.nodeSel.exit().remove();
      var nodeEnter = net.nodeSel.enter().append('g').attr('class', 'lsg-node');
      nodeEnter.append('circle');
      nodeEnter.append('title');
      nodeEnter.append('text').attr('dy', '0.32em').attr('text-anchor', 'middle');
      net.nodeSel = nodeEnter.merge(net.nodeSel);
      net.nodeSel.select('circle')
        .attr('r', function (d) { return nodeRadius(d); })
        .attr('fill', function (d) { return color(d.group); });
      net.nodeSel.select('title').text(function (d) {
        return d.name + ' — ' + d.group + (d.branch ? ' · ' + d.branch : '');
      });
      net.nodeSel.select('text').text(function (d) { return d.name; })
        .attr('y', function (d) { return -nodeRadius(d) - 6; });
      net.nodeSel.call(makeDrag(net.simulation))
        .on('mouseenter', onNodeHover)
        .on('mouseleave', onNodeLeave)
        .on('click',      onNodeClick);

      applyUserStateDecor();
      recomputeDegrees();
      applyLabelVisibility();

      // HULLS — only in network view, not geo
      var hullData = [];
      if (state.view === 'network') {
        var famGroups = Object.create(null);
        visibleNodes.forEach(function (n) { (famGroups[n.group] || (famGroups[n.group] = [])).push(n); });
        hullData = Object.keys(famGroups).filter(function (f) { return famGroups[f].length >= 3; })
          .map(function (f) { return { family: f, members: famGroups[f] }; });
      }
      net.hullSel = net.hullLayer.selectAll('path.lsg-hull').data(hullData, function (d) { return d.family; });
      net.hullSel.exit().remove();
      var hullEnter = net.hullSel.enter().append('path').attr('class', 'lsg-hull');
      net.hullSel = hullEnter.merge(net.hullSel)
        .attr('fill', function (d) { return color(d.family); })
        .attr('stroke', function (d) { return color(d.family); });

      // simulation
      net.simulation.nodes(visibleNodes);
      net.simulation.force('link').links(visibleLinks);
      if (!prefersReducedMotion && state.view !== 'geo')
        net.simulation.alpha(0.6).restart();
      else
        onNetTick();

      statNodes.textContent = String(visibleNodes.length);
      statLinks.textContent = String(visibleLinks.length);
      if (hoveredId) applyHover(hoveredId);
      renderPathOverlay();
      updateFocusRing();
    }

    function expandHull(points, pad) {
      var cx = 0, cy = 0;
      points.forEach(function (p) { cx += p[0]; cy += p[1]; });
      cx /= points.length; cy /= points.length;
      return points.map(function (p) {
        var dx = p[0] - cx, dy = p[1] - cy;
        var len = Math.sqrt(dx*dx + dy*dy) || 1;
        return [ p[0] + (dx/len) * pad, p[1] + (dy/len) * pad ];
      });
    }
    function onNetTick() {
      net.linkSel.each(function (l) {
        var sx = l.source.x, sy = l.source.y, tx = l.target.x, ty = l.target.y;
        var dx = tx - sx, dy = ty - sy;
        var dr = Math.sqrt(dx*dx + dy*dy) || 1;
        var off = Math.min(28, dr * 0.16);
        var mx = (sx + tx) / 2, my = (sy + ty) / 2;
        var nx = -dy / dr, ny = dx / dr;
        var cx = mx + nx * off, cy = my + ny * off;
        var endX = tx, endY = ty;
        if (l.directed) {
          var tr = nodeRadius(l.target) + 4;
          var ang = Math.atan2(ty - cy, tx - cx);
          endX = tx - Math.cos(ang) * tr;
          endY = ty - Math.sin(ang) * tr;
        }
        var path = 'M' + sx + ',' + sy + ' Q' + cx + ',' + cy + ' ' + endX + ',' + endY;
        this.firstChild.setAttribute('d', path);
        this.lastChild.setAttribute('d', path);
      });
      net.nodeSel.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      net.hullSel.attr('d', function (d) {
        if (d.members.length < 3) return null;
        var pts = d.members.map(function (n) { return [n.x, n.y]; });
        var hull = d3.polygonHull(pts);
        if (!hull) return null;
        hull = expandHull(hull, 18);
        return 'M' + hull.map(function (p) { return p.join(','); }).join('L') + 'Z';
      });
      // Path overlay
      renderPathOverlay();
      updateFocusRing();
    }
    function renderPathOverlay() {
      if (!net.pathLayer) return;
      net.pathLayer.selectAll('*').remove();
      if (!state.pathHighlight || state.pathHighlight.length < 2) return;
      for (var i = 0; i < state.pathHighlight.length - 1; i++) {
        var a = nodeById[state.pathHighlight[i]], b = nodeById[state.pathHighlight[i+1]];
        if (!a || !b || a.x == null || b.x == null) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var dr = Math.sqrt(dx*dx + dy*dy) || 1;
        var off = Math.min(28, dr * 0.16);
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var nx = -dy / dr, ny = dx / dr;
        var cx = mx + nx * off, cy = my + ny * off;
        net.pathLayer.append('path').attr('class', 'lsg-path-link')
          .attr('d', 'M' + a.x + ',' + a.y + ' Q' + cx + ',' + cy + ' ' + b.x + ',' + b.y);
      }
      net.nodeSel.classed('lsg-path-node', function (d) {
        return state.pathHighlight.indexOf(d.id) > -1;
      });
    }

    function makeDrag(sim) {
      return d3.drag()
        .on('start', function (event, d) {
          if (prefersReducedMotion || state.view === 'geo') return;
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', function (event, d) {
          if (prefersReducedMotion || state.view === 'geo') return;
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', function (event, d) {
          if (prefersReducedMotion || state.view === 'geo') return;
          if (!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        });
    }

    /* hover dim */
    var hoveredId = null;
    function onNodeHover(event, d) { hoveredId = d.id; applyHover(d.id); }
    function onNodeLeave()         { hoveredId = null; clearHover(); }
    function neighboursOf(id) {
      var set = Object.create(null); set[id] = true;
      net.linkSel.each(function (l) {
        if (l.dist >= state.threshold) return;
        var s = l.source.id || l.source, t = l.target.id || l.target;
        if (s === id) set[t] = true;
        if (t === id) set[s] = true;
      });
      return set;
    }
    function applyHover(id) {
      if (!net.nodeSel) return;
      var nbrs = neighboursOf(id);
      net.nodeSel.classed('lsg-faded',  function (n) { return !nbrs[n.id]; })
                 .classed('lsg-bright', function (n) { return !!nbrs[n.id]; });
      net.linkSel.classed('lsg-faded', function (l) {
        var s = l.source.id || l.source, t = l.target.id || l.target;
        return !(s === id || t === id);
      });
      net.linkSel.select('.lsg-link').classed('lsg-link-hot', function (l) {
        var s = l.source.id || l.source, t = l.target.id || l.target;
        return (s === id || t === id);
      });
      net.hullSel.classed('lsg-faded', function (h) { return h.family !== nodeById[id].group; });
    }
    function clearHover() {
      if (!net.nodeSel) return;
      net.nodeSel.classed('lsg-faded', false).classed('lsg-bright', false);
      net.linkSel.classed('lsg-faded', false);
      net.linkSel.select('.lsg-link').classed('lsg-link-hot', false);
      net.hullSel.classed('lsg-faded', false);
    }

    /* ═══════════════════════════════════════════════════════════════════
       Edge hover tooltip (with cognates + data-quality indicator)
       ═════════════════════════════════════════════════════════════════ */
    function injectGlossaryLinks(str) {
      // Wrap known glossary terms in a span (whole-word match, case-insensitive).
      // Operates on text content only; assumes input is already HTML-escaped.
      if (!window.LSG_GLOSSARY) return str;
      var terms = Object.keys(window.LSG_GLOSSARY).sort(function (a, b) { return b.length - a.length; });
      var out = str;
      terms.forEach(function (term) {
        var safe = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        var re = new RegExp('(^|[^\\w])(' + safe + ')(?![\\w])', 'gi');
        out = out.replace(re, function (_, pre, m) {
          return pre + '<span class="lsg-gloss-term" data-gloss="' + term + '">' + m + '</span>';
        });
      });
      return out;
    }

    function onEdgeHover(event, l) {
      var sId = (typeof l.source === 'object') ? l.source.id : l.source;
      var tId = (typeof l.target === 'object') ? l.target.id : l.target;
      var dirn = !!l.directed;
      var html = '<div class="lsg-edge-head">' +
        escapeHTML(nodeById[sId].name) +
        (dirn ? ' <span>→</span> ' : ' <span>·</span> ') +
        escapeHTML(nodeById[tId].name) +
        '<span>d ' + l.dist.toFixed(0) + '</span></div>';
      var rows = [
        [tt('lexical'),   simByMetric(D, 'lexical',        sId, tId, dirn)],
        [tt('grammar'),   simByMetric(D, 'grammatical',    sId, tId, false)],
        [tt('phonology'), simByMetric(D, 'phonological',   sId, tId, false)],
        [tt('script'),    simByMetric(D, 'writing_system', sId, tId, false)],
        [tt('genealogy'), simByMetric(D, 'genealogical',   sId, tId, false)]
      ];
      rows.forEach(function (r) {
        html += '<div class="lsg-edge-row"><span>' + injectGlossaryLinks(r[0]) +
                '</span><b>' + r[1].toFixed(2) + '</b></div>';
      });
      // Data-quality flag for lexical
      if (!isLexCurated(D, sId, tId)) {
        html += '<div class="lsg-data-flag">' + tt('lexical') + ': ' + tt('estimated') + '</div>';
      }
      // Cognates
      var ck = pairKey(sId, tId);
      var cogs = (window.LSG_COGNATES && window.LSG_COGNATES[ck]) || [];
      if (cogs.length) {
        html += '<div class="lsg-cognates">';
        html += '<div class="lsg-cognates-title">' + tt('cognates') + '</div>';
        cogs.slice(0, 4).forEach(function (c) {
          // Pair direction in cognate data is sorted (a < b)
          var leftId  = sId < tId ? sId : tId;
          var rightId = sId < tId ? tId : sId;
          html += '<div class="lsg-cognate-row">' +
                  '<span class="lsg-cognate-gloss">' + escapeHTML(c.gloss) + '</span>' +
                  '<span class="lsg-cognate-words">' + escapeHTML(c.a) + '</span>' +
                  '<span class="lsg-cognate-sep">↔</span>' +
                  '<span class="lsg-cognate-words">' + escapeHTML(c.b) + '</span>' +
                  '</div>';
        });
        html += '</div>';
      }
      // Contact bonus + note
      if (dirn) {
        var cb = contactDir(D, sId, tId);
        if (cb > 0) {
          var info = D.contact[sId + '|' + tId];
          html += '<div class="lsg-edge-row" style="margin-top:4px"><span>' +
                  tt('contactBonus') + '</span><b>+' + cb.toFixed(2) + '</b></div>';
          if (info && info.note)
            html += '<div style="margin-top:4px;color:var(--lsg-text-mute);font-size:0.66rem;line-height:1.3">' +
                    escapeHTML(info.note) + '</div>';
        }
      }
      edgeTip.innerHTML = html;
      edgeTip.hidden = false;
      requestAnimationFrame(function () { edgeTip.classList.add('is-open'); });
      onEdgeMove(event);
      bindGlossInteractions(edgeTip);
    }
    function onEdgeMove(event) {
      var rect = wrap.getBoundingClientRect();
      var x = (event.clientX - rect.left) + 12;
      var y = (event.clientY - rect.top)  + 12;
      edgeTip.style.left = x + 'px'; edgeTip.style.top = y + 'px';
      requestAnimationFrame(function () {
        var tw = edgeTip.offsetWidth, th = edgeTip.offsetHeight;
        if (x + tw > rect.width  - 8) edgeTip.style.left = Math.max(8, rect.width  - tw - 8) + 'px';
        if (y + th > rect.height - 8) edgeTip.style.top  = Math.max(8, rect.height - th - 8) + 'px';
      });
    }
    function onEdgeLeave() {
      edgeTip.classList.remove('is-open');
      setTimeout(function () {
        if (!edgeTip.classList.contains('is-open')) edgeTip.hidden = true;
      }, 160);
    }

    /* Glossary popover */
    function bindGlossInteractions(root) {
      root.querySelectorAll('.lsg-gloss-term').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var term = el.dataset.gloss;
          var def = (window.LSG_GLOSSARY || {})[term];
          if (!def) return;
          glossPopT.textContent = term;
          glossPopB.textContent = def;
          var rect = el.getBoundingClientRect();
          glossPop.style.left = (rect.left + window.scrollX) + 'px';
          glossPop.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
          glossPop.hidden = false;
          requestAnimationFrame(function () { glossPop.classList.add('is-open'); });
        });
      });
    }
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.lsg-gloss-term') && !e.target.closest('#lsg-gloss-popover')) {
        glossPop.classList.remove('is-open');
        setTimeout(function () { if (!glossPop.classList.contains('is-open')) glossPop.hidden = true; }, 150);
      }
    });

    /* ═══════════════════════════════════════════════════════════════════
       Node click → tooltip with closest neighbours + Compare action
       ═════════════════════════════════════════════════════════════════ */
    function onNodeClick(event, d) {
      event.stopPropagation();
      state.pinnedId = d.id;
      state.focusedId = d.id;
      net.nodeSel.classed('is-pinned', function (n) { return n.id === d.id; });
      openTipFor(d, event);
      updateFocusRing();
      scheduleUrlSync();
    }
    function openTipFor(d, event) {
      var rows = nodes.filter(function (n) { return n.id !== d.id; })
        .map(function (n) { return { id: n.id, name: n.name, dist: distance(D, state.metric, d.id, n.id, false) }; })
        .sort(function (a, b) { return a.dist - b.dist; }).slice(0, 5);
      tipName.textContent = d.name;
      var metaBits = [d.group];
      if (d.branch && d.branch !== d.group) metaBits.push(d.branch);
      if (d.subbranch && d.subbranch !== d.branch) metaBits.push(d.subbranch);
      tipMeta.textContent = metaBits.join(' · ');

      tipList.innerHTML = '';
      rows.forEach(function (nb) {
        var row = document.createElement('div');
        row.className = 'lsg-tip-row';
        var left = document.createElement('b'); left.textContent = nb.name;
        var right = document.createElement('span'); right.textContent = 'd ' + nb.dist.toFixed(0);
        row.appendChild(left); row.appendChild(right);
        tipList.appendChild(row);
      });

      var alpine = getAlpineData();
      if (alpine && Array.isArray(alpine.speakers) && alpine.speakers.indexOf(d.id) < 0) {
        tipActions.hidden = false;
        var inSlots = alpine.compareSlots && alpine.compareSlots.indexOf(d.id) > -1;
        tipCompare.textContent = inSlots ? tt('removeCompare') : tt('addCompare');
        tipCompare.dataset.targetCode = d.id;
      } else {
        tipActions.hidden = true;
      }

      var rect = wrap.getBoundingClientRect();
      var x = (event.clientX - rect.left) + 14;
      var y = (event.clientY - rect.top)  + 14;
      tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
      tipEl.classList.add('is-open');
      tipEl.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(function () {
        var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
        if (x + tw > rect.width  - 8) tipEl.style.left = Math.max(8, rect.width  - tw - 8) + 'px';
        if (y + th > rect.height - 8) tipEl.style.top  = Math.max(8, rect.height - th - 8) + 'px';
      });
    }
    function closeTip() {
      tipEl.classList.remove('is-open');
      tipEl.setAttribute('aria-hidden', 'true');
      state.pinnedId = null;
      if (net.nodeSel) net.nodeSel.classed('is-pinned', false);
    }
    tipClose.addEventListener('click', function (e) { e.stopPropagation(); closeTip(); });
    tipCompare.addEventListener('click', function (e) {
      e.stopPropagation();
      var code = tipCompare.dataset.targetCode;
      var alpine = getAlpineData();
      if (!alpine || !code || typeof alpine.toggleCompare !== 'function') return;
      alpine.toggleCompare(code);
      var inSlots = alpine.compareSlots && alpine.compareSlots.indexOf(code) > -1;
      tipCompare.textContent = inSlots ? tt('removeCompare') : tt('addCompare');
    });

    /* ═══════════════════════════════════════════════════════════════════
       User-state decoration
       ═════════════════════════════════════════════════════════════════ */
    function applyUserStateDecor() {
      if (!net.nodeSel) return;
      var spkSet = Object.create(null);
      userSpeakers.forEach(function (s) { spkSet[s] = true; });
      var recSet = Object.create(null);
      userRecs.forEach(function (r) { recSet[r] = true; });
      net.nodeSel
        .classed('is-known', function (n) { return !!spkSet[n.id]; })
        .classed('is-rec',   function (n) { return !!recSet[n.id]; });
    }
    function refreshFromAlpine() {
      var a = getAlpineData();
      if (!a) return;
      // language sync
      var lng = a.currentLang || 'en';
      if (lng !== alpineLastLang) {
        alpineLastLang = lng;
        if (window.LSG_T && window.LSG_T[lng]) {
          currentUiLang = lng;
          applyI18n(container);
          // Update placeholders / dynamic strings
          searchInp.placeholder = tt('findPlaceholder');
          learnWrap.title = tt('learningViewHint');
        }
      }
      // speakers / recs sync
      var spk = Array.isArray(a.speakers) ? a.speakers.slice() : [];
      var recs = [];
      try { recs = (a.recommendations || []).slice(0, 5).map(function (r) { return r.target; }); }
      catch (e) {}
      var key = spk.join(',') + '|' + recs.join(',');
      if (key === lastAlpineKey) return;
      lastAlpineKey = key;
      userSpeakers = spk; userRecs = recs;
      if (userSpeakers.length === 0) {
        learnInp.disabled = true; learnWrap.classList.add('is-disabled');
        if (state.learning) { state.learning = false; learnInp.checked = false; }
      } else {
        learnInp.disabled = false; learnWrap.classList.remove('is-disabled');
      }
      rebuildLinks();
      if (state.view === 'network' || state.view === 'geo') renderNet();
      // refresh tree/matrix decorations if active
      if (state.view === 'tree')   renderTree();
      if (state.view === 'matrix') renderMatrix();
    }
    setInterval(refreshFromAlpine, 1200);
    setTimeout(refreshFromAlpine, 300);

    /* ═══════════════════════════════════════════════════════════════════
       Legend
       ═════════════════════════════════════════════════════════════════ */
    families.forEach(function (fam) {
      var item = document.createElement('button');
      item.type = 'button'; item.className = 'lsg-legend-item';
      item.setAttribute('aria-pressed', 'true');
      item.dataset.family = fam;
      var sw = document.createElement('span'); sw.className = 'lsg-legend-swatch'; sw.style.background = color(fam);
      var label = document.createElement('span'); label.textContent = fam;
      item.appendChild(sw); item.appendChild(label);
      item.addEventListener('click', function () {
        familyHidden[fam] = !familyHidden[fam];
        item.classList.toggle('lsg-mute', !!familyHidden[fam]);
        item.setAttribute('aria-pressed', familyHidden[fam] ? 'false' : 'true');
        if (state.view === 'network' || state.view === 'geo') renderNet();
        if (state.view === 'tree')   renderTree();
        if (state.view === 'matrix') renderMatrix();
      });
      legendEl.appendChild(item);
    });

    /* ═══════════════════════════════════════════════════════════════════
       Threshold + Repulsion sliders
       ═════════════════════════════════════════════════════════════════ */
    function updateSliderTrack(el) {
      var pct = (el.value - el.min) / (el.max - el.min) * 100;
      el.style.setProperty('--lsg-slider-pct', pct + '%');
    }
    updateSliderTrack(slider); updateSliderTrack(charge);
    slider.addEventListener('input', function () {
      state.threshold = +slider.value;
      sliderVal.textContent = String(state.threshold);
      updateSliderTrack(slider);
      if (state.view === 'network' || state.view === 'geo') renderNet();
      scheduleUrlSync();
    });
    charge.addEventListener('input', function () {
      chargeStrength = +charge.value; updateSliderTrack(charge);
      if (state.view === 'network' && !prefersReducedMotion) {
        net.simulation.force('charge').strength(chargeStrength);
        net.simulation.alpha(0.4).restart();
      }
    });

    /* ═══════════════════════════════════════════════════════════════════
       Metric switcher
       ═════════════════════════════════════════════════════════════════ */
    if (metricRow) metricRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.lsg-chip'); if (!btn) return;
      var m = btn.dataset.metric; if (!m || m === state.metric) return;
      state.metric = m;
      metricRow.querySelectorAll('.lsg-chip').forEach(function (c) {
        c.classList.toggle('is-active', c.dataset.metric === m);
      });
      // invalidate clustering caches
      leafOrderCache = null; clusterRootCache = null;
      lastClusterMetric = null; lastTreeMetric = null;
      rebuildLinks();
      if (state.view === 'network' || state.view === 'geo') renderNet();
      if (state.view === 'tree')   renderTree();
      if (state.view === 'matrix') renderMatrix();
      scheduleUrlSync();
    });

    /* ═══════════════════════════════════════════════════════════════════
       Search box
       ═════════════════════════════════════════════════════════════════ */
    var searchActiveIndex = -1;
    function renderSearchResults(query) {
      var q = (query || '').trim().toLowerCase();
      searchRes.innerHTML = ''; searchActiveIndex = -1;
      if (!q) { searchRes.hidden = true; return; }
      var matches = nodes.filter(function (n) {
        return n.name.toLowerCase().indexOf(q) > -1 || n.id.toLowerCase() === q ||
               n.group.toLowerCase().indexOf(q) > -1 || (n.branch || '').toLowerCase().indexOf(q) > -1;
      }).sort(function (a, b) {
        var ai = a.name.toLowerCase().indexOf(q), bi = b.name.toLowerCase().indexOf(q);
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      }).slice(0, 8);
      if (matches.length === 0) {
        var empty = document.createElement('div'); empty.className = 'lsg-search-empty';
        empty.textContent = 'No language matches'; searchRes.appendChild(empty);
      } else {
        matches.forEach(function (n) {
          var row = document.createElement('div');
          row.className = 'lsg-search-item'; row.dataset.code = n.id; row.setAttribute('role','option');
          row.innerHTML = '<span>' + escapeHTML(n.name) + '</span>' +
                          '<small>' + escapeHTML(n.group) + (n.branch ? ' · ' + escapeHTML(n.branch) : '') + '</small>';
          row.addEventListener('click', function () { jumpTo(n.id); });
          searchRes.appendChild(row);
        });
      }
      searchRes.hidden = false;
    }
    function updateSearchActive() {
      var items = searchRes.querySelectorAll('.lsg-search-item');
      items.forEach(function (el, i) { el.classList.toggle('is-active', i === searchActiveIndex); });
    }
    searchInp.addEventListener('input', function () { renderSearchResults(searchInp.value); });
    searchInp.addEventListener('focus', function () { if (searchInp.value) renderSearchResults(searchInp.value); });
    searchInp.addEventListener('keydown', function (e) {
      var items = searchRes.querySelectorAll('.lsg-search-item');
      if (e.key === 'ArrowDown') { e.preventDefault();
        searchActiveIndex = Math.min(items.length - 1, searchActiveIndex + 1); updateSearchActive();
      } else if (e.key === 'ArrowUp') { e.preventDefault();
        searchActiveIndex = Math.max(0, searchActiveIndex - 1); updateSearchActive();
      } else if (e.key === 'Enter') {
        var pick = items[searchActiveIndex] || items[0];
        if (pick) { e.preventDefault(); jumpTo(pick.dataset.code); }
      } else if (e.key === 'Escape') { searchRes.hidden = true; searchInp.blur(); }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.lsg-search-wrap')) searchRes.hidden = true;
    });
    function jumpTo(code) {
      var node = nodeById[code]; if (!node) return;
      searchRes.hidden = true; searchInp.value = node.name;
      if (state.view !== 'network' && state.view !== 'geo') {
        setView('network');
        setTimeout(function () { jumpTo(code); }, 200);
        return;
      }
      var k = Math.max(1.2, net.currentZoom.k || 1);
      var tx = W / 2 - node.x * k;
      var ty = H / 2 - node.y * k;
      var t  = d3.zoomIdentity.translate(tx, ty).scale(k);
      svg.transition().duration(550).call(net.zoomBehaviour.transform, t).on('end', function () {
        var rect = wrap.getBoundingClientRect();
        onNodeClick({ stopPropagation: function () {}, clientX: rect.left + W/2, clientY: rect.top + H/2 }, node);
      });
    }

    /* ═══════════════════════════════════════════════════════════════════
       Learning view toggle
       ═════════════════════════════════════════════════════════════════ */
    learnInp.addEventListener('change', function () {
      state.learning = !!learnInp.checked && userSpeakers.length > 0;
      rebuildLinks();
      if (state.view === 'network' || state.view === 'geo') renderNet();
      scheduleUrlSync();
    });

    /* ═══════════════════════════════════════════════════════════════════
       Reset view + Copy link
       ═════════════════════════════════════════════════════════════════ */
    resetBtn.addEventListener('click', function () {
      if (state.view === 'network' || state.view === 'geo') {
        svg.transition().duration(450).call(net.zoomBehaviour.transform, d3.zoomIdentity);
        if (!prefersReducedMotion && state.view === 'network') {
          nodes.forEach(function (n) { n.fx = null; n.fy = null; });
          net.simulation.alpha(0.8).restart();
        }
      }
      state.focusedId = null;
      closeTip(); updateFocusRing(); scheduleUrlSync();
    });
    copyBtn.addEventListener('click', function () {
      writeUrlState(currentStateObj());
      var url = location.href;
      function show(msg) {
        copyToast.textContent = msg;
        copyToast.classList.add('is-open');
        setTimeout(function () { copyToast.classList.remove('is-open'); }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(url).then(function () { show(tt('linkCopied')); },
                                              function () { show('URL updated'); });
      else show('URL updated');
    });
    function currentStateObj() {
      return {
        v: state.view, t: state.threshold, m: state.metric,
        n: state.focusedId || '', L: state.learning ? '1' : '',
        k: ((net.currentZoom && net.currentZoom.k) || 1).toFixed(2),
        x: Math.round((net.currentZoom && net.currentZoom.x) || 0),
        y: Math.round((net.currentZoom && net.currentZoom.y) || 0)
      };
    }
    var urlSyncT;
    function scheduleUrlSync() {
      clearTimeout(urlSyncT);
      urlSyncT = setTimeout(function () { writeUrlState(currentStateObj()); }, 250);
    }

    /* ═══════════════════════════════════════════════════════════════════
       Keyboard navigation (network/geo only)
       ═════════════════════════════════════════════════════════════════ */
    function updateFocusRing() {
      if (state.view !== 'network' && state.view !== 'geo') return;
      if (!net.focusCircle) return;
      if (!state.focusedId || !nodeById[state.focusedId]) {
        net.focusCircle.style('display', 'none');
        if (net.nodeSel) net.nodeSel.classed('is-focused', false);
        return;
      }
      var n = nodeById[state.focusedId];
      net.focusCircle.style('display', null)
        .attr('cx', n.x).attr('cy', n.y).attr('r', nodeRadius(n) + 6);
      if (net.nodeSel) net.nodeSel.classed('is-focused', function (d) { return d.id === n.id; });
    }
    function nearestInDirection(from, dirVec) {
      var best = null, bestScore = Infinity;
      nodes.filter(isVisibleNode).forEach(function (n) {
        if (n.id === from.id) return;
        var dx = n.x - from.x, dy = n.y - from.y;
        var len = Math.sqrt(dx*dx + dy*dy) || 1;
        var dot = (dx * dirVec[0] + dy * dirVec[1]) / len;
        if (dot < 0.4) return;
        var score = len / (0.4 + dot);
        if (score < bestScore) { bestScore = score; best = n; }
      });
      return best;
    }
    svgEl.addEventListener('keydown', function (e) {
      if (state.view !== 'network' && state.view !== 'geo') return;
      var dirMap = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
      if (e.key in dirMap) {
        e.preventDefault();
        var from = state.focusedId && nodeById[state.focusedId]
                 ? nodeById[state.focusedId]
                 : (nodes.find(function (n) { return n.id === 'en'; }) || nodes[0]);
        var nxt = nearestInDirection(from, dirMap[e.key]);
        if (nxt) { state.focusedId = nxt.id; updateFocusRing(); scheduleUrlSync(); }
      } else if (e.key === 'Enter' && state.focusedId) {
        e.preventDefault();
        var n = nodeById[state.focusedId];
        if (n) {
          var rect = wrap.getBoundingClientRect();
          onNodeClick({ stopPropagation: function () {}, clientX: rect.left + W/2, clientY: rect.top + H/2 }, n);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault(); closeTip(); state.focusedId = null; updateFocusRing(); scheduleUrlSync();
      }
    });

    /* ═══════════════════════════════════════════════════════════════════
       Responsive resize
       ═════════════════════════════════════════════════════════════════ */
    var resizeT;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        var d = dims(); W = d.w; H = d.h;
        svg.attr('viewBox', '0 0 ' + W + ' ' + H);
        if (state.view === 'network' && !prefersReducedMotion) {
          net.simulation.force('center', d3.forceCenter(W/2, H/2));
          net.simulation.force('x', d3.forceX(W/2).strength(0.03));
          net.simulation.force('y', d3.forceY(H/2).strength(0.03));
          net.simulation.alpha(0.4).restart();
        } else {
          setView(state.view);
        }
      }, 120);
    });

    /* ═══════════════════════════════════════════════════════════════════
       TREE VIEW (dendrogram)
       ═════════════════════════════════════════════════════════════════ */
    function renderTree() {
      svg.selectAll('*').remove();
      var g = svg.append('g').attr('class', 'lsg-tree-root').attr('transform', 'translate(40,20)');
      var root = getClusterRoot(state.metric);
      // Convert to d3 hierarchy
      function toD3(n) {
        if (n.leaf) return { name: nodeById[n.code].name, code: n.code, dist: 0 };
        return { name: '', dist: n.dist,
                 children: [toD3(n.children[0]), toD3(n.children[1])] };
      }
      var data = toD3(root);
      var h = d3.hierarchy(data);
      var clusterLayout = d3.cluster().size([H - 80, W - 200]);
      clusterLayout(h);

      // Draw links
      g.selectAll('path.lsg-tree-link').data(h.links()).enter()
        .append('path').attr('class', 'lsg-tree-link')
        .attr('d', function (l) {
          return 'M' + l.source.y + ',' + l.source.x +
                 'C' + (l.source.y + 30) + ',' + l.source.x +
                  ' ' + (l.target.y - 30) + ',' + l.target.x +
                  ' ' + l.target.y + ',' + l.target.x;
        });

      // Draw nodes (leaves get a coloured circle)
      var spkSet = Object.create(null);
      userSpeakers.forEach(function (s) { spkSet[s] = true; });
      var nodeG = g.selectAll('g.lsg-tree-node').data(h.descendants()).enter()
        .append('g').attr('class', function (d) {
          return 'lsg-tree-node' + (d.data.code ? ' lsg-tree-leaf' : '');
        })
        .attr('transform', function (d) { return 'translate(' + d.y + ',' + d.x + ')'; });
      nodeG.append('circle')
        .attr('r', function (d) { return d.data.code ? 4 : 2; })
        .attr('fill', function (d) {
          if (!d.data.code) return 'var(--lsg-panel)';
          var n = nodeById[d.data.code];
          return color(n.group);
        })
        .attr('stroke', function (d) {
          if (d.data.code && spkSet[d.data.code]) return '#fbbf24';
          return 'var(--lsg-text-dim)';
        })
        .attr('stroke-width', function (d) {
          return (d.data.code && spkSet[d.data.code]) ? 2 : 1;
        });
      nodeG.filter(function (d) { return !!d.data.code; })
        .append('text').attr('class', function (d) {
          return 'lsg-tree-label' + (spkSet[d.data.code] ? ' lsg-known' : '');
        })
        .attr('dx', 6).attr('dy', '0.32em').text(function (d) { return d.data.name; })
        .style('cursor', 'pointer')
        .on('click', function (event, d) {
          // Switch back to network and jump
          var code = d.data.code;
          setView('network');
          setTimeout(function () { jumpTo(code); }, 200);
        });
      statNodes.textContent = String(codes.length);
      statLinks.textContent = String(codes.length - 1);
    }

    /* ═══════════════════════════════════════════════════════════════════
       MATRIX VIEW (heatmap)
       ═════════════════════════════════════════════════════════════════ */
    function renderMatrix() {
      svg.selectAll('*').remove();
      var order = getLeafOrder(state.metric);
      var n = order.length;
      var pad = { l: 90, t: 90, r: 10, b: 10 };
      var cell = Math.max(4, Math.floor(Math.min(W - pad.l - pad.r, H - pad.t - pad.b) / n));
      var matrixSize = cell * n;
      var g = svg.append('g').attr('class', 'lsg-matrix-root')
        .attr('transform', 'translate(' + pad.l + ',' + pad.t + ')');
      // Family color bar — top
      var familyBarH = 4;
      g.append('g').selectAll('rect').data(order).enter().append('rect')
        .attr('class', 'lsg-matrix-fambar')
        .attr('x', function (_, i) { return i * cell; })
        .attr('y', -familyBarH - 2).attr('width', cell).attr('height', familyBarH)
        .attr('fill', function (c) { return color(nodeById[c].group); });
      // Family color bar — left
      g.append('g').selectAll('rect').data(order).enter().append('rect')
        .attr('class', 'lsg-matrix-fambar')
        .attr('x', -familyBarH - 2)
        .attr('y', function (_, i) { return i * cell; })
        .attr('width', familyBarH).attr('height', cell)
        .attr('fill', function (c) { return color(nodeById[c].group); });
      // Cells
      var spkSet = Object.create(null);
      userSpeakers.forEach(function (s) { spkSet[s] = true; });
      var colorScale = d3.scaleSequential().domain([0, 100]).interpolator(d3.interpolateInferno);
      var rows = g.append('g').selectAll('g').data(order).enter().append('g')
        .attr('transform', function (_, i) { return 'translate(0,' + i * cell + ')'; });
      rows.each(function (rCode, ri) {
        var row = d3.select(this);
        row.selectAll('rect.lsg-matrix-cell').data(order).enter().append('rect')
          .attr('class', 'lsg-matrix-cell')
          .attr('x', function (_, ci) { return ci * cell; })
          .attr('y', 0).attr('width', cell).attr('height', cell)
          .attr('fill', function (cCode) {
            if (cCode === rCode) return 'var(--lsg-panel)';
            var d = distance(D, state.metric, rCode, cCode, false);
            return colorScale(d);
          })
          .append('title').text(function (cCode) {
            if (cCode === rCode) return nodeById[rCode].name;
            var d = distance(D, state.metric, rCode, cCode, false);
            return nodeById[rCode].name + ' · ' + nodeById[cCode].name + ' — d ' + d.toFixed(0);
          });
        // click → jump in network
        row.selectAll('rect.lsg-matrix-cell')
          .on('click', function (event, cCode) {
            if (cCode === rCode) return;
            setView('network');
            setTimeout(function () { jumpTo(rCode); }, 200);
          });
      });
      // Row labels (left)
      g.append('g').selectAll('text').data(order).enter().append('text')
        .attr('class', function (c) { return 'lsg-matrix-rowlabel' + (spkSet[c] ? ' lsg-known' : ''); })
        .attr('x', -8).attr('y', function (_, i) { return i * cell + cell / 2; })
        .attr('text-anchor', 'end').attr('dy', '0.32em')
        .text(function (c) { return nodeById[c].name; });
      // Column labels (top, rotated)
      g.append('g').selectAll('text').data(order).enter().append('text')
        .attr('class', function (c) { return 'lsg-matrix-collabel' + (spkSet[c] ? ' lsg-known' : ''); })
        .attr('x', function (_, i) { return i * cell + cell / 2; })
        .attr('y', -8).attr('text-anchor', 'start').attr('dy', '0.32em')
        .attr('transform', function (_, i) {
          return 'rotate(-65 ' + (i * cell + cell / 2) + ',-8)';
        })
        .text(function (c) { return nodeById[c].name; });
      statNodes.textContent = String(n);
      statLinks.textContent = String(n * (n - 1) / 2);
    }

    /* ═══════════════════════════════════════════════════════════════════
       Shortest path widget
       ═════════════════════════════════════════════════════════════════ */
    function findShortestPath() {
      var a = pathFrom.value, b = pathTo.value;
      if (!a || !b || a === b) {
        pathRes.innerHTML = '<span class="lsg-path-empty">Pick two different languages.</span>';
        state.pathHighlight = [];
        if (net.pathLayer) renderPathOverlay();
        return;
      }
      var distFn = function (x, y) { return distance(D, state.metric, x, y, false); };
      var res = dijkstra(codes, distFn, a, b);
      if (!res) {
        pathRes.innerHTML = '<span class="lsg-path-empty">No path found.</span>';
        state.pathHighlight = [];
        if (net.pathLayer) renderPathOverlay();
        return;
      }
      var html = '';
      res.path.forEach(function (c, i) {
        if (i > 0) {
          var step = distance(D, state.metric, res.path[i-1], c, false);
          html += '<span class="lsg-path-arrow">→ ' + step.toFixed(0) + ' →</span>';
        }
        html += '<span class="lsg-path-step">' + escapeHTML(D.languages[c].name) + '</span>';
      });
      html += '<div class="lsg-path-meta">Total accumulated distance: ' + res.totalDist.toFixed(0) +
              ' · ' + (res.path.length - 1) + ' hop' + (res.path.length === 2 ? '' : 's') + '</div>';
      pathRes.innerHTML = html;
      state.pathHighlight = res.path;
      if (state.view === 'network' || state.view === 'geo') {
        renderPathOverlay();
      } else {
        setView('network');
      }
    }
    pathFind.addEventListener('click', findShortestPath);
    pathClear.addEventListener('click', function () {
      pathFrom.value = ''; pathTo.value = '';
      pathRes.innerHTML = '<span class="lsg-path-empty">Pick two languages and click <b>Find path</b>.</span>';
      state.pathHighlight = [];
      if (net.pathLayer) renderPathOverlay();
    });

    /* ═══════════════════════════════════════════════════════════════════
       View-mode switcher
       ═════════════════════════════════════════════════════════════════ */
    function setView(mode) {
      if (mode === state.view) return;
      state.view = mode;
      container.classList.remove('lsg-view-network','lsg-view-tree','lsg-view-matrix','lsg-view-geo');
      container.classList.add('lsg-view-' + mode);
      viewRow.querySelectorAll('.lsg-chip').forEach(function (c) {
        c.classList.toggle('is-active', c.dataset.view === mode);
      });
      // Some controls only make sense in network/geo
      var inGraph = (mode === 'network' || mode === 'geo');
      slider.disabled = !inGraph;
      charge.disabled = (mode !== 'network');
      if (mode === 'network' || mode === 'geo') {
        net = {}; initNetworkLayer(mode === 'geo');
      } else if (mode === 'tree') {
        net = {}; renderTree();
      } else if (mode === 'matrix') {
        net = {}; renderMatrix();
      }
      scheduleUrlSync();
    }
    viewRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.lsg-chip'); if (!btn) return;
      var v = btn.dataset.view; if (!v) return;
      setView(v);
    });

    /* ═══════════════════════════════════════════════════════════════════
       Export menu — PNG / SVG / embed
       ═════════════════════════════════════════════════════════════════ */
    exportBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = exportMenu.classList.contains('is-open');
      if (open) {
        exportMenu.classList.remove('is-open');
        setTimeout(function () { if (!exportMenu.classList.contains('is-open')) exportMenu.hidden = true; }, 150);
      } else {
        exportMenu.hidden = false;
        var rect = exportBtn.getBoundingClientRect();
        var wrapRect = container.getBoundingClientRect();
        exportMenu.style.right = (wrapRect.right - rect.right) + 'px';
        exportMenu.style.top   = (rect.bottom - wrapRect.top + 4) + 'px';
        requestAnimationFrame(function () { exportMenu.classList.add('is-open'); });
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#lsg-export-btn') && !e.target.closest('#lsg-export-menu')) {
        exportMenu.classList.remove('is-open');
        setTimeout(function () { if (!exportMenu.classList.contains('is-open')) exportMenu.hidden = true; }, 150);
      }
    });
    exportMenu.addEventListener('click', function (e) {
      var btn = e.target.closest('button'); if (!btn) return;
      var kind = btn.dataset.export;
      if (kind === 'png')   exportPng();
      if (kind === 'svg')   exportSvg();
      if (kind === 'embed') copyEmbed();
      exportMenu.classList.remove('is-open');
      setTimeout(function () { if (!exportMenu.classList.contains('is-open')) exportMenu.hidden = true; }, 150);
    });
    function serializedSvg() {
      // Clone, inline the computed background so the export looks like the canvas
      var clone = svgEl.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', W); clone.setAttribute('height', H);
      // Inline bg
      var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', 0); bg.setAttribute('y', 0);
      bg.setAttribute('width', W); bg.setAttribute('height', H);
      bg.setAttribute('fill', '#1c1917');
      clone.insertBefore(bg, clone.firstChild);
      return new XMLSerializer().serializeToString(clone);
    }
    function downloadBlob(blob, name) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
    function exportSvg() {
      var str = serializedSvg();
      downloadBlob(new Blob([str], { type: 'image/svg+xml' }),
                   'language-graph-' + state.view + '.svg');
    }
    function exportPng() {
      var str = serializedSvg();
      var img = new Image();
      var blob = new Blob([str], { type: 'image/svg+xml' });
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        var scale = 2;
        var canvas = document.createElement('canvas');
        canvas.width = W * scale; canvas.height = H * scale;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1c1917'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob2) {
          downloadBlob(blob2, 'language-graph-' + state.view + '.png');
        }, 'image/png');
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        copyToast.textContent = 'PNG export failed — try SVG instead';
        copyToast.classList.add('is-open');
        setTimeout(function () { copyToast.classList.remove('is-open'); }, 2000);
      };
      img.src = url;
    }
    function copyEmbed() {
      writeUrlState(currentStateObj());
      var base = location.protocol + '//' + location.host + location.pathname;
      var hash = location.hash;
      var src = base + hash;
      var html = '<iframe src="' + src + '" width="100%" height="720" style="border:0;border-radius:12px"></iframe>';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(html).then(function () {
          copyToast.textContent = tt('embedCopied');
          copyToast.classList.add('is-open');
          setTimeout(function () { copyToast.classList.remove('is-open'); }, 1800);
        });
      }
    }

    /* ═══════════════════════════════════════════════════════════════════
       Guided tour
       ═════════════════════════════════════════════════════════════════ */
    var TOUR_STEPS = [
      { sel: '#lsg-title',       title: 'Welcome',
        body: 'This is the Language Similarity Graph — every node is a language, every line connects pairs that are linguistically close.' },
      { sel: '#lsg-view-row',    title: 'Four views of the same data',
        body: 'Switch between Network (default), Tree (dendrogram), Matrix (heatmap), and Geographic. Each reveals different structure.' },
      { sel: '#lsg-threshold',   title: 'Distance threshold',
        body: 'Drag the slider to widen or narrow which pairs count as "connected". Larger threshold = more lines.' },
      { sel: '#graph-container .lsg-chip-row[aria-label="Distance metric"]',
        title: 'Metric switcher',
        body: 'Recolour the connections by a single dimension — lexical (shared vocabulary), grammar, phonology, script, or family — to see how each one clusters languages differently.' },
      { sel: '#lsg-search',      title: 'Find any language',
        body: 'Type a name and we jump and open its detail card. Works from any view.' },
      { sel: '#lsg-learning-wrap', title: 'Personalised "Learning view"',
        body: 'Pick languages you know in the app above; turn this on to see directed arrows from your known languages to everything else — your personalised study map.' },
      { sel: '#lsg-path-card',   title: 'Shortest learning path',
        body: 'Pick two languages and we compute the linguistic stepping-stone chain between them.' },
      { sel: '#lsg-surprising-card', title: 'Surprising connections',
        body: 'Cross-family pairs that came out closer than you’d expect. Click one to investigate.' }
    ];
    var tourIdx = 0;
    var tourBackdrop = document.getElementById('lsg-tour-backdrop');
    var tourSpotlight = document.getElementById('lsg-tour-spotlight');
    var tourPopover  = document.getElementById('lsg-tour-popover');
    var tourTitle    = document.getElementById('lsg-tour-title');
    var tourBody     = document.getElementById('lsg-tour-body');
    var tourCounter  = document.getElementById('lsg-tour-counter');
    var tourPrev     = document.getElementById('lsg-tour-prev');
    var tourNext     = document.getElementById('lsg-tour-next');
    var tourSkip     = document.getElementById('lsg-tour-skip');
    function showTourStep(i) {
      var step = TOUR_STEPS[i];
      var el = document.querySelector(step.sel);
      if (!el) { return endTour(); }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        var r = el.getBoundingClientRect();
        var pad = 6;
        tourSpotlight.hidden = false;
        tourSpotlight.style.left   = (r.left - pad) + 'px';
        tourSpotlight.style.top    = (r.top  - pad) + 'px';
        tourSpotlight.style.width  = (r.width  + pad * 2) + 'px';
        tourSpotlight.style.height = (r.height + pad * 2) + 'px';
        tourTitle.textContent = step.title;
        tourBody.textContent  = step.body;
        tourCounter.textContent = (i + 1) + ' / ' + TOUR_STEPS.length;
        tourPrev.disabled = (i === 0);
        tourNext.textContent = (i === TOUR_STEPS.length - 1) ? tt('tourDone') : tt('tourNext');
        // Position popover below or above element
        var popH = 180; // rough est
        var top = r.bottom + 12;
        if (top + popH > window.innerHeight) top = Math.max(12, r.top - popH - 12);
        tourPopover.style.left = Math.min(window.innerWidth - 340, Math.max(12, r.left)) + 'px';
        tourPopover.style.top  = top + 'px';
        tourPopover.hidden = false;
      }, 250);
    }
    function startTour() {
      tourIdx = 0;
      tourBackdrop.hidden = false;
      requestAnimationFrame(function () { tourBackdrop.classList.add('is-open'); });
      showTourStep(0);
    }
    function endTour() {
      tourBackdrop.classList.remove('is-open');
      tourSpotlight.hidden = true;
      tourPopover.hidden = true;
      setTimeout(function () { tourBackdrop.hidden = true; }, 250);
      try { localStorage.setItem('lsg-tour-seen', '1'); } catch (e) {}
    }
    // The tour overlay DOM (#lsg-tour-backdrop, #lsg-tour-prev, …) is commented
    // out in index.html, so these getElementById() calls return null. Guard
    // every listener so the engine doesn't bail before finishing init.
    var tourElementsPresent = !!(tourBackdrop && tourSpotlight && tourPopover
      && tourTitle && tourBody && tourCounter && tourPrev && tourNext && tourSkip);
    if (tourElementsPresent) {
      tourPrev.addEventListener('click', function () { if (tourIdx > 0) showTourStep(--tourIdx); });
      tourNext.addEventListener('click', function () {
        if (tourIdx === TOUR_STEPS.length - 1) endTour();
        else showTourStep(++tourIdx);
      });
      tourSkip.addEventListener('click', endTour);
    }
    if (helpBtn) helpBtn.addEventListener('click', startTour);
    // Auto-show on first visit (only if the overlay actually exists)
    try {
      if (tourElementsPresent && !localStorage.getItem('lsg-tour-seen')) {
        setTimeout(startTour, 2200);
      }
    } catch (e) {}

    /* ═══════════════════════════════════════════════════════════════════
       Tiny helpers
       ═════════════════════════════════════════════════════════════════ */
    function escapeHTML(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* ═══════════════════════════════════════════════════════════════════
       First paint
       ═════════════════════════════════════════════════════════════════ */
    applyI18n(container);
    searchInp.placeholder = tt('findPlaceholder');
    learnWrap.title = tt('learningViewHint');
    container.classList.add('lsg-view-' + state.view);
    rebuildLinks();
    if (state.view === 'network' || state.view === 'geo') initNetworkLayer(state.view === 'geo');
    else if (state.view === 'tree') renderTree();
    else if (state.view === 'matrix') renderMatrix();
    if (state.focusedId && nodeById[state.focusedId] && (state.view === 'network' || state.view === 'geo')) {
      setTimeout(function () {
        var n = nodeById[state.focusedId];
        var rect = wrap.getBoundingClientRect();
        onNodeClick({ stopPropagation: function () {}, clientX: rect.left + W/2, clientY: rect.top + H/2 }, n);
      }, prefersReducedMotion ? 50 : 800);
    }
  }
})();
