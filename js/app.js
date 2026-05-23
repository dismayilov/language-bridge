/* ============================================================================
 * MyNextLanguage.org — app.js
 * ----------------------------------------------------------------------------
 * The Alpine.js application: language picker, weight sliders, recommendation
 * ranking, reverse-analysis tab, world-map rendering, parallel-sentence
 * comparison, profile persistence (localStorage), share-permalink encoding
 * and live UI-language switching (TRANSLATIONS / LANG_NAMES).
 *
 * All static linguistic data this file reads is hydrated onto `window.*`
 * by js/data-loader.js BEFORE Alpine starts (see deferLoadingAlpine).
 * Specifically: DATA, TRANSLATIONS, LANG_NAMES, LANG_NATIVE, LANG_FLAG,
 *               LANG_GROUPS, FSI_TIER, LANG_PHRASES, PARALLEL_SENTENCES,
 *               LANG_CONTEXT, FAMILY_NAMES, BRANCH_NAMES, SPEAKER_DATA,
 *               ISO_A2_TO_NUM, DIACRITIC_COMPAT, ORTHO_PROFILES,
 *               CEFR_WEIGHTS, DEFAULT_WEIGHTS.
 * Exposes the Alpine component constructor as window.app().
 * ========================================================================== */

// ── Module-level helpers (outside the Alpine proxy to avoid reactivity issues) ──
let _numToA2 = null;
function getNumToA2() {
  if (!_numToA2) {
    _numToA2 = {};
    for (const [a2, n] of Object.entries(ISO_A2_TO_NUM)) _numToA2[n] = a2;
  }
  return _numToA2;
}
const _dnCache = {};
function countryDisplayName(a2, lang) {
  const k = a2 + ':' + lang;
  if (!_dnCache[k]) {
    try { _dnCache[k] = new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(a2) || a2; }
    catch { _dnCache[k] = a2; }
  }
  return _dnCache[k];
}
function flagEmoji(a2) {
  return [...a2.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

// ── Analytics: safe wrapper so ad-blockers never crash the app ─────────
function umamiTrack(eventName, props) {
  try {
    if (typeof umami !== 'undefined' && typeof umami.track === 'function') {
      umami.track(eventName, props || {});
    }
  } catch (_) {}
}

function app() {
  return {
    DATA,
    search: '',
    speakers: ['en'].filter(c => c in DATA.languages),
    weights: {...DEFAULT_WEIGHTS},
    topN: 15,
    proficiency: {},
    selectedCard: null,
    geoData: null,
    geoReady: false,
    mapLoading: false,
    geoError: false,
    viewMode: 'recommendations',
    reverseTarget: '',
    reverseSearch: '',
    sharing: false,
    sharingCard: null,
    emailInput: '',
    emailStatus: 'idle',   // 'idle' | 'loading' | 'success' | 'error'
    emailMsg: '',
    pinned: [],            // bookmarked target language codes
    pinnedNotes: {},       // { [langCode]: string } personal notes per pinned language
    learningStatus: {},    // { [langCode]: 'interested'|'studying'|'done' }
    pinnedOnly: false,     // filter recommendations to pinned only
    compareSlots: [],      // up to 2 language codes for side-by-side comparison
    recSearch: '',         // live search filter on recommendations list
    swUpdateReady: false,  // true when a new service worker version is waiting
    fsiMaxTier: 0,         // 0 = all tiers; 1 = Cat I; 2 = Cat I–II; 3 = Cat I–III
    savedToast: false,     // transient "profile saved" toast
    _toastTimer: null,
    tooltip: { visible: false, x: 0, y: 0, flag: '', country: '', status: '' },
    isDark: document.documentElement.classList.contains('dark'),
    currentLang: (function() {
      const s = localStorage.getItem('lb-lang');
      return (s && TRANSLATIONS[s]) ? s : 'en';
    })(),

    t(key, vars = {}) {
      const lang = TRANSLATIONS[this.currentLang] || TRANSLATIONS['en'];
      let str = lang[key] !== undefined ? lang[key] : (TRANSLATIONS['en'][key] || key);
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll('{' + k + '}', v);
      }
      return str;
    },

    saveLang() {
      localStorage.setItem('lb-lang', this.currentLang);
      document.documentElement.lang = this.currentLang;
    },

    langName(code) {
      const names = LANG_NAMES[this.currentLang];
      if (names && names[code]) return names[code];
      // Defensive: some codes (e.g. 'sr') appear in LANG_GROUPS but not in
      // DATA.languages — fall back to the code itself rather than throwing.
      return DATA.languages[code]?.name || code;
    },

    familyName(code) {
      const fam = DATA.languages[code]?.family;
      if (!fam) return '';
      const t = FAMILY_NAMES[this.currentLang];
      return (t && t[fam]) ? t[fam] : fam;
    },

    branchName(code) {
      const br = DATA.languages[code]?.branch;
      if (!br) return '';
      const t = BRANCH_NAMES[this.currentLang];
      return (t && t[br]) ? t[br] : br;
    },
    // ====== REVERSE SEARCH ======
    get reverseAnalysis() {
      const target = this.reverseTarget;
      if (!target || !this.speakers.length) return null;
      const dims = ['genealogical','lexical','grammatical','phonological','writing_system'];
      const totalW = Object.values(this.weights).reduce((a,b)=>a+b,0)||1;
      const w = {};
      for (const k of Object.keys(this.weights)) w[k] = this.weights[k]/totalW;

      const rows = this.speakers.map(h => {
        const m = CEFR_WEIGHTS[this.proficiency[h]] ?? 1.0;
        const raw = {
          genealogical:  this.genealogical(h, target),
          lexical:       this.lexicalSimilarity(h, target),
          grammatical:   this.grammatical(h, target),
          phonological:  this.phonological(h, target),
          writing_system:this.writingSystem(h, target),
        };
        const weighted = {};
        for (const d of dims) weighted[d] = raw[d] * m;
        const [bonus] = this.contactBonus(h, target);
        const lexBonus = Math.min(1.0, weighted.lexical + bonus * m);
        const total =
          weighted.genealogical  * w.genealogical  +
          lexBonus               * w.lexical        +
          weighted.grammatical   * w.grammatical    +
          weighted.phonological  * w.phonological   +
          weighted.writing_system* w.writing_system;
        return { helper: h, weighted, lexBonus, total, raw, contactBonus: bonus };
      });
      rows.sort((a,b) => b.total - a.total);
      return rows;
    },

    get reverseSearchResults() {
      const q = this.reverseSearch.trim().toLowerCase();
      const all = Object.keys(DATA.languages).filter(c => !this.speakers.includes(c));
      if (!q) return all.sort((a,b)=>this.langName(a).localeCompare(this.langName(b))).slice(0,12);
      const matches = c => {
        if (c === q) return true;
        if (this.langName(c).toLowerCase().includes(q)) return true;
        if (DATA.languages[c].name.toLowerCase().includes(q)) return true;
        if ((LANG_NATIVE[c] || '').toLowerCase().includes(q)) return true;
        if ((DATA.languages[c].family || '').toLowerCase().includes(q)) return true;
        if ((DATA.languages[c].branch || '').toLowerCase().includes(q)) return true;
        return false;
      };
      return all
        .filter(matches)
        .sort((a,b)=>{
          // Exact ISO or starts-with sorts to top
          const startA = this.langName(a).toLowerCase().startsWith(q) ? 0 : 1;
          const startB = this.langName(b).toLowerCase().startsWith(q) ? 0 : 1;
          if (startA !== startB) return startA - startB;
          return this.langName(a).localeCompare(this.langName(b));
        })
        .slice(0,10);
    },

    dimPct(row, dim) {
      const v = dim === 'lexical' ? row.lexBonus : row.weighted[dim === 'writing' ? 'writing_system' : dim === 'genealogical' ? 'genealogical' : dim];
      return Math.round((v||0)*100);
    },

    init() {
      const saved = localStorage.getItem('lb-theme');
      if (saved === 'dark') { document.documentElement.classList.add('dark'); this.isDark = true; }
      else if (saved === 'light') { document.documentElement.classList.remove('dark'); this.isDark = false; }
      document.documentElement.lang = this.currentLang;

      // URL state takes priority over localStorage; fall back when no hash is present
      const fromUrl = this.readFromUrl();
      if (!fromUrl) {
        this.loadProfile();
      } else {
        // Always restore bookmarks from localStorage even when URL overrides the rest
        try {
          const pi = localStorage.getItem('lb-pinned');
          if (pi) this.pinned = JSON.parse(pi).filter(c => c in DATA.languages);
          const pn = localStorage.getItem('lb-pinned-notes');
          if (pn) this.pinnedNotes = JSON.parse(pn);
          const ls = localStorage.getItem('lb-status');
          if (ls) this.learningStatus = JSON.parse(ls);
        } catch (_) {}
      }

      // Auto-save + sync URL on every state change
      this.$watch('speakers',     () => { this.persistProfile(); this.syncToUrl(); });
      this.$watch('proficiency',  () => { this.persistProfile(); this.syncToUrl(); });
      this.$watch('weights',      () => this.syncToUrl());
      this.$watch('selectedCard', () => this.syncToUrl());
      this.$watch('compareSlots', () => this.syncToUrl());

      // SW update detection — set flag if a new worker is already waiting at init time,
      // or listen for the custom event fired by the registration script
      if (window.__swWaiting) this.swUpdateReady = true;
      document.addEventListener('sw-update-ready', () => { this.swUpdateReady = true; });

      // Keyboard navigation for recommendation cards
      document.addEventListener('keydown', (e) => {
        // Only active when recommendations tab is visible and no input is focused
        if (this.viewMode !== 'recommendations') return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        const recs = this.displayRecommendations;
        if (!recs.length) return;

        if (e.key === 'Escape') {
          if (this.selectedCard) { this.selectedCard = null; e.preventDefault(); }
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const cur = recs.findIndex(r => r.target === this.selectedCard);
          let next;
          if (cur === -1) {
            next = e.key === 'ArrowDown' ? 0 : recs.length - 1;
          } else {
            next = e.key === 'ArrowDown'
              ? Math.min(cur + 1, recs.length - 1)
              : Math.max(cur - 1, 0);
          }
          this.selectedCard = recs[next].target;
          // Scroll card into view
          this.$nextTick(() => {
            const el = document.querySelector(`[data-card="${recs[next].target}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
        if (e.key === 'Enter' && this.selectedCard) {
          // Toggle open/close
          const cur = this.selectedCard;
          this.selectedCard = null;
          this.$nextTick(() => { if (this.selectedCard === null) {} });
          // Re-open if pressing Enter on a closed card — handled by toggleCard on click
        }
      });

      // BMC widget click tracking — fires once the widget iframe has mounted
      document.addEventListener('click', function bmcClickHandler(e) {
        const el = e.target.closest('#bmc-wbtn, [id^="bmc-"], .bmc-btn, a[href*="buymeacoffee.com"]');
        if (el) umamiTrack('click_support_dev', { source: 'buy_me_a_coffee' });
      });
    },

    toggleSpeaker(code) {
      if (this.speakers.includes(code)) {
        this.speakers = this.speakers.filter(c => c !== code);
        const p = { ...this.proficiency };
        delete p[code];
        this.proficiency = p;
      } else {
        this.speakers = [...this.speakers, code];
        this.proficiency = { ...this.proficiency, [code]: 'C2' };
        umamiTrack('select_known_language', {
          language_code: code,
          language_name: this.langName(code),
        });
      }
    },

    toggleTheme() {
      this.isDark = !this.isDark;
      if (this.isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('lb-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('lb-theme', 'light');
      }
    },

    resetWeights() {
      this.weights = { ...DEFAULT_WEIGHTS };
    },

    get filteredLanguages() {
      const q = this.search.toLowerCase().trim();
      if (!q) return Object.keys(DATA.languages);
      return Object.keys(DATA.languages).filter(code => {
        if (code === q) return true;                                              // exact ISO match
        if (DATA.languages[code].name.toLowerCase().includes(q)) return true;    // English name
        if ((LANG_NAMES[this.currentLang]?.[code] || '').toLowerCase().includes(q)) return true; // UI lang
        if ((LANG_NATIVE[code] || '').toLowerCase().includes(q)) return true;    // native script
        if ((DATA.languages[code].family || '').toLowerCase().includes(q)) return true; // family
        if ((DATA.languages[code].branch || '').toLowerCase().includes(q)) return true; // branch
        return false;
      });
    },

    get weightDims() {
      return [
        { key: 'lexical',         label: this.t('dimLexicon') },
        { key: 'grammatical',     label: this.t('dimGrammar') },
        { key: 'phonological',    label: this.t('dimPhonology') },
        { key: 'writing_system',  label: this.t('dimWriting') },
        { key: 'genealogical',    label: this.t('dimFamily') },
      ];
    },

    get weightPresets() {
      return [
        { label: 'Balanced',
          desc: 'Default weighting across all five dimensions',
          w: { lexical: 35, grammatical: 25, phonological: 10, writing_system: 10, genealogical: 20 } },
        { label: 'Vocabulary-first',
          desc: 'Maximise shared words — great for readers and passive learners',
          w: { lexical: 55, grammatical: 15, phonological: 10, writing_system: 5,  genealogical: 15 } },
        { label: 'Grammar-first',
          desc: 'Prioritise structural similarity — ideal for analytical learners',
          w: { lexical: 20, grammatical: 50, phonological: 10, writing_system: 5,  genealogical: 15 } },
        { label: 'Sound-first',
          desc: 'Favour phonological closeness — for oral/conversational learners',
          w: { lexical: 20, grammatical: 15, phonological: 45, writing_system: 5,  genealogical: 15 } },
        { label: 'Script-first',
          desc: 'Heavily weight writing system — minimise time learning a new alphabet',
          w: { lexical: 20, grammatical: 15, phonological: 10, writing_system: 40, genealogical: 15 } },
      ];
    },

    get subscoreDims() {
      return [
        { key: 'lexical',        label: this.t('subLex'),
          tip: 'Shared vocabulary — cognates, loanwords, and recognisable roots. Higher = more words you already half-know.' },
        { key: 'grammatical',    label: this.t('subGram'),
          tip: 'Grammar distance — word order, morphology, and syntax similarity. Higher = fewer structural surprises.' },
        { key: 'phonological',   label: this.t('subPhon'),
          tip: 'Sound system overlap — shared phonemes and prosody. Higher = pronunciation will feel more natural from day one.' },
        { key: 'writing_system', label: this.t('subScript'),
          tip: 'Writing system difficulty — script familiarity and orthographic complexity. Higher = less time learning to read.' },
        { key: 'genealogical',   label: this.t('subFamily'),
          tip: 'Language family closeness — how recently the two languages shared a common ancestor. Higher = deeper structural kinship.' },
      ];
    },

    scoreTier(v) {
      if (v >= 0.70) return { label: 'High',   cls: 'text-emerald-600 dark:text-emerald-400' };
      if (v >= 0.40) return { label: 'Medium', cls: 'text-amber-500  dark:text-amber-400'   };
      return                 { label: 'Low',    cls: 'text-stone-400  dark:text-stone-500'    };
    },

    learningStatusMeta(code) {
      const s = this.learningStatus[code];
      if (s === 'interested') return { label: '★ Interested', cls: 'status-badge status-interested', next: 'studying' };
      if (s === 'studying')   return { label: '📖 Studying',  cls: 'status-badge status-studying',   next: 'done'      };
      if (s === 'done')       return { label: '✓ Done',       cls: 'status-badge status-done',        next: null        };
      return null;
    },

    cycleStatus(code) {
      const cur = this.learningStatus[code];
      const next = cur === 'interested' ? 'studying' : cur === 'studying' ? 'done' : cur === 'done' ? null : 'interested';
      const updated = { ...this.learningStatus };
      if (next === null) delete updated[code]; else updated[code] = next;
      this.learningStatus = updated;
      try { localStorage.setItem('lb-status', JSON.stringify(this.learningStatus)); } catch(_) {}
    },

    // ── Linguistic bridge helpers ─────────────────────────────────
    bridgeFor(code) {
      let bestScore = -1, bestLang = null;
      for (const spk of this.speakers) {
        const score = (this.lexicalSimilarity(spk, code) + this.genealogical(spk, code) +
          this.grammatical(spk, code) + this.phonological(spk, code) + this.writingSystem(spk, code)) / 5;
        if (score > bestScore) { bestScore = score; bestLang = spk; }
      }
      return bestLang;
    },
    parallelSentencesFor(code) {
      if (!this.speakers.length) return null;
      // Rank all known languages by composite similarity to target
      const ranked = [...this.speakers].map(spk => ({
        spk,
        score: (this.lexicalSimilarity(spk, code) + this.genealogical(spk, code) +
          this.grammatical(spk, code) + this.phonological(spk, code) + this.writingSystem(spk, code)) / 5
      })).sort((a, b) => b.score - a.score);

      // ── Tier 1: custom curated parallel sentences ──────────────────────────
      for (const { spk } of ranked) {
        const key1 = spk + '|' + code;
        const key2 = code + '|' + spk;
        if (PARALLEL_SENTENCES[key1]) return { sentences: PARALLEL_SENTENCES[key1], bridge: spk, reversed: false, tier: 1 };
        if (PARALLEL_SENTENCES[key2]) return { sentences: PARALLEL_SENTENCES[key2], bridge: spk, reversed: true,  tier: 1 };
      }

      // ── Tier 2: universal phrase-bank fallback (100% coverage) ────────────
      const bestSpk = ranked[0]?.spk;
      if (bestSpk && LANG_PHRASES[bestSpk] && LANG_PHRASES[code]) {
        const helperPhrases = LANG_PHRASES[bestSpk];
        const targetPhrases = LANG_PHRASES[code];
        return {
          sentences: helperPhrases.p.map((ph, i) => ({
            b:  ph,
            rb: helperPhrases.r ? helperPhrases.r[i] : null,
            t:  (targetPhrases.p[i] || ''),
            rt: targetPhrases.r  ? targetPhrases.r[i]  : null,
            c:  []
          })),
          bridge: bestSpk,
          reversed: false,
          tier: 2
        };
      }

      return null;
    },
    markCognates(text, words) {
      if (!text || !words || !words.length) return text;
      const patterns = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const regex = new RegExp('(' + patterns.join('|') + ')', 'gi');
      return text.replace(regex, '<span class="cognate-hl">$1</span>');
    },

    // ── Detail panel ─────────────────────────────────────────────
    toggleCard(code) {
      const opening = (this.selectedCard !== code);
      this.selectedCard = opening ? code : null;
      if (this.selectedCard && !this.geoReady && !this.mapLoading) this.loadGeoData();
      if (opening) {
        umamiTrack('view_target_details', {
          language_code: code,
          language_name: this.langName(code),
          score: +(this.recommendations.find(r => r.target === code)?.total || 0).toFixed(3),
        });
      }
    },

    async loadGeoData() {
      this.mapLoading = true; this.geoError = false;
      try {
        if (!window.topojson) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topo = await r.json();
        this.geoData = topojson.feature(topo, topo.objects.countries).features;
        this.geoReady = true;
      } catch (e) {
        this.geoError = true;
      } finally {
        this.mapLoading = false;
      }
    },

    _geoRing(ring, W, H) {
      if (!ring.length) return '';
      // Unwrap longitudes at the antimeridian so polygons that cross ±180°
      // (e.g. Russia/Chukotka, Fiji, Alaska) render as a continuous shape
      // instead of drawing a line across the entire map canvas.
      const lons = [ring[0][0]];
      for (let i = 1; i < ring.length; i++) {
        let lon = ring[i][0];
        const delta = lon - lons[i - 1];
        if (delta > 180)  lon -= 360;
        else if (delta < -180) lon += 360;
        lons.push(lon);
      }
      let d = '';
      for (let i = 0; i < ring.length; i++) {
        const x = ((lons[i] + 180) / 360 * W).toFixed(1);
        const y = ((90 - ring[i][1]) / 180 * H).toFixed(1);
        d += (i === 0 ? 'M' : 'L') + x + ',' + y;
      }
      return d + 'Z';
    },

    buildMapSvg(code) {
      if (!this.geoReady || !this.geoData) return '';
      const recSd = SPEAKER_DATA[code];
      const recA2s  = new Set(recSd ? recSd.official : []);
      const recNums = new Set([...recA2s].map(a2 => ISO_A2_TO_NUM[a2]).filter(Boolean));

      // Build regional lookup: numericId → { coverage, notes }
      const regionalNums = new Map();
      for (const r of (recSd?.regions || [])) {
        const num = ISO_A2_TO_NUM[r.countryCode];
        if (num) regionalNums.set(num, r);
      }

      const knownA2s = new Set();
      for (const spk of this.speakers) {
        const spkSd = SPEAKER_DATA[spk];
        if (spkSd) for (const a2 of spkSd.official) knownA2s.add(a2);
      }
      const knownNums = new Set([...knownA2s].map(a2 => ISO_A2_TO_NUM[a2]).filter(Boolean));

      // Theme-aware diagonal hatch pattern for regional countries
      const isDark  = this.darkMode;
      const emerald = isDark ? '#34d399' : '#059669';
      const violet  = isDark ? '#c4b5fd' : '#a78bfa';
      const defs =
        '<defs>' +
          '<pattern id="rh-em" x="0" y="0" width="8" height="8"' +
          ' patternUnits="userSpaceOnUse" patternTransform="rotate(45 4 4)">' +
            '<rect width="8" height="8" fill="none"/>' +
            '<line x1="0" y1="0" x2="0" y2="8" stroke="' + emerald + '" stroke-width="3" stroke-opacity="0.55"/>' +
          '</pattern>' +
          '<pattern id="rh-vl" x="0" y="0" width="8" height="8"' +
          ' patternUnits="userSpaceOnUse" patternTransform="rotate(45 4 4)">' +
            '<rect width="8" height="8" fill="none"/>' +
            '<line x1="0" y1="0" x2="0" y2="8" stroke="' + violet + '" stroke-width="3" stroke-opacity="0.55"/>' +
          '</pattern>' +
        '</defs>';

      const W = 960, H = 480;
      let paths = '';
      for (const f of this.geoData) {
        if (!f.geometry) continue;
        const id = +f.id;
        const isRec      = recNums.has(id);
        const isKnown    = knownNums.has(id);
        const isRegional = !isRec && regionalNums.has(id);

        let cls, fillAttr = '';
        if (isRec && isKnown)           { cls = 'country overlap'; }
        else if (isRec)                 { cls = 'country recommended'; }
        else if (isRegional && isKnown) { cls = 'country regional overlap'; fillAttr = ' fill="url(#rh-vl)"'; }
        else if (isRegional)            { cls = 'country regional'; fillAttr = ' fill="url(#rh-em)"'; }
        else if (isKnown)               { cls = 'country known'; }
        else                            { cls = 'country'; }

        let d = '';
        const geom = f.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
        for (const poly of polys) for (const ring of poly) d += this._geoRing(ring, W, H);
        if (d) paths += '<path class="' + cls + '"' + fillAttr + ' data-cid="' + id + '" d="' + d + '"/>';
      }

      return '<svg class="lang-map-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">'
        + '<rect width="' + W + '" height="' + H + '" class="ocean"/>'
        + defs + paths + '</svg>';
    },

    fmtM(n) {
      if (n == null) return '?';
      if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/, '') + 'B';
      if (n >= 1)    return n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '') + 'M';
      return Math.round(n * 1000) + 'K';
    },

    _bboxArea(f, W, H) {
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      const geom = f.geometry;
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      for (const poly of polys) {
        if (!poly[0]) continue;
        for (const [lon, lat] of poly[0]) {
          if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        }
      }
      return ((maxLon - minLon) / 360 * W) * ((maxLat - minLat) / 180 * H);
    },

    smallCountries(code) {
      if (!this.geoReady || !this.geoData) return [];
      const recSd = SPEAKER_DATA[code];
      if (!recSd) return [];
      const W = 960, H = 480;
      const seen = new Set();
      const result = [];
      // Official countries (full colour) — always listed if tiny
      for (const a2 of (recSd.official || [])) {
        if (seen.has(a2)) continue; seen.add(a2);
        const num = ISO_A2_TO_NUM[a2];
        if (!num) { result.push({ a2, flag: flagEmoji(a2), name: countryDisplayName(a2, this.currentLang), regional: false }); continue; }
        const feat = this.geoData.find(f => +f.id === num);
        if (!feat || !feat.geometry) { result.push({ a2, flag: flagEmoji(a2), name: countryDisplayName(a2, this.currentLang), regional: false }); continue; }
        if (this._bboxArea(feat, W, H) < 16) result.push({ a2, flag: flagEmoji(a2), name: countryDisplayName(a2, this.currentLang), regional: false });
      }
      // Regional countries — only list if bbox area < 80 (notable small countries like Lebanon)
      for (const r of (recSd.regions || [])) {
        const a2 = r.countryCode;
        if (seen.has(a2)) continue; seen.add(a2);
        const num = ISO_A2_TO_NUM[a2];
        if (!num) continue;
        const feat = this.geoData.find(f => +f.id === num);
        if (!feat || !feat.geometry) continue;
        if (this._bboxArea(feat, W, H) < 80) {
          result.push({ a2, flag: flagEmoji(a2), name: countryDisplayName(a2, this.currentLang), regional: true,
            coverage: Math.round(r.coverage * 100) });
        }
      }
      result.sort((a, b) => a.name.localeCompare(b.name));
      return result;
    },

    mapHover(event, code) {
      const cidStr = event.target.dataset?.cid;
      if (!cidStr) { this.tooltip.visible = false; return; }
      const cid = +cidStr;
      const numToA2 = getNumToA2();
      const a2 = numToA2[cid];
      if (!a2) { this.tooltip.visible = false; return; }
      const recSd = SPEAKER_DATA[code];
      const recA2s = new Set(recSd ? recSd.official : []);
      // Build regional lookup for the target language
      const regionalMap = new Map((recSd?.regions || []).map(r => [r.countryCode, r]));
      const knownLangs = this.speakers.filter(spk => {
        const sd = SPEAKER_DATA[spk];
        return sd && sd.official.includes(a2);
      });
      const isOfficial = recA2s.has(a2);
      const regionalEntry = !isOfficial ? regionalMap.get(a2) : null;
      let status = '';
      if (isOfficial && knownLangs.length) {
        status = this.langName(code) + ' + ' + knownLangs.map(l => this.langName(l)).join(', ');
      } else if (isOfficial) {
        status = this.langName(code);
      } else if (regionalEntry) {
        const pct = Math.round(regionalEntry.coverage * 100);
        status = this.langName(code) + ' (Regional — ~' + pct + '% of population)';
        if (knownLangs.length) status += ' · ' + knownLangs.map(l => this.langName(l)).join(', ');
      } else if (knownLangs.length) {
        status = knownLangs.map(l => this.langName(l)).join(', ');
      }
      this.tooltip = { visible: true, x: event.clientX, y: event.clientY,
        flag: flagEmoji(a2), country: countryDisplayName(a2, this.currentLang), status };
    },

    // ── Scoring ──────────────────────────────────────────────────
    k(a, b) { return a < b ? a + '|' + b : b + '|' + a; },

    lexicalSimilarity(a, b) {
      if (a === b) return 1.0;
      const key = this.k(a, b);
      if (DATA.lexical[key] !== undefined) return DATA.lexical[key];
      const la = DATA.languages[a], lb = DATA.languages[b];
      if (la.family !== lb.family) return 0.03;
      if (la.branch !== lb.branch) return 0.10;
      if (la.subbranch !== lb.subbranch) return 0.30;
      return 0.55;
    },

    genealogical(a, b) {
      const la = DATA.languages[a], lb = DATA.languages[b];
      if (la.family !== lb.family) return 0.0;
      if (la.branch !== lb.branch) return 0.4;
      if (la.subbranch !== lb.subbranch) return 0.7;
      return 1.0;
    },

    wordOrderSim(la, lb) {
      const fam = {
        'SVO': ['SVO'], 'V2': ['V2','SVO'], 'SOV': ['SOV'], 'VSO': ['VSO'],
        'SVO(free)': ['SVO(free)','SVO'], 'SOV(free)': ['SOV(free)','SOV'],
        'topic-focus(free)': ['topic-focus(free)','SVO(free)','SVO'],
      };
      if (la.word_order === lb.word_order) return 1.0;
      if ((fam[la.word_order]||[]).includes(lb.word_order)) return 0.7;
      if ((fam[lb.word_order]||[]).includes(la.word_order)) return 0.7;
      return 0.0;
    },

    morphSim(la, lb) {
      if (la.morphology === lb.morphology) return 1.0;
      const pairs = {
        'analytic|analytic-fusional': 0.8, 'fusional|analytic-fusional': 0.8,
        'analytic|fusional': 0.3, 'fusional|agglutinative': 0.2,
        'analytic|agglutinative': 0.1, 'analytic-fusional|agglutinative': 0.15,
        'analytic|analytic-agglutinative': 0.4, 'agglutinative|analytic-agglutinative': 0.6,
      };
      const key = [la.morphology, lb.morphology].sort().join('|');
      return pairs[key] || 0.0;
    },

    grammatical(a, b) {
      const la = DATA.languages[a], lb = DATA.languages[b];
      const caseDiff = Math.abs(la.case_count - lb.case_count);
      const caseScore = Math.max(0, 1 - caseDiff/8);
      const genderDiff = Math.abs(la.gender_count - lb.gender_count);
      const genderScore = Math.max(0, 1 - genderDiff/3);
      let artScore;
      if (la.articles === lb.articles) artScore = 1.0;
      else if (la.articles !== 'none' && lb.articles !== 'none') artScore = 0.5;
      else artScore = 0.2;
      const wordScore = this.wordOrderSim(la, lb);
      const morphScore = this.morphSim(la, lb);
      const vhScore = (la.vowel_harmony === lb.vowel_harmony) ? 1.0 : 0.0;
      return (caseScore + genderScore + artScore + wordScore + morphScore + vhScore) / 6;
    },

    phonological(a, b) {
      const pa = new Set(DATA.languages[a].phoneme_features);
      const pb = new Set(DATA.languages[b].phoneme_features);
      if (pa.size === 0 && pb.size === 0) return 1.0;
      let inter = 0;
      for (const x of pa) if (pb.has(x)) inter++;
      const union = pa.size + pb.size - inter;
      return union === 0 ? 0 : inter / union;
    },

    writingSystem(a, b) {
      // 3-tier Orthographic Distance Algorithm (max 100 pts → normalised 0-1)
      const la = DATA.languages[a], lb = DATA.languages[b];
      const sa = la.writing_system, sb = lb.writing_system;

      // ── Tier 1: Base Script Family (70 pts) ─────────────────────
      function scriptFamily(ws) {
        if (ws.includes('Latin'))    return 'Latin';
        if (ws.includes('Cyrillic')) return 'Cyrillic';
        if (ws.includes('Arabic'))   return 'Arabic';
        if (ws.includes('Hebrew'))   return 'Hebrew';
        if (ws.includes('Devanagari')) return 'Devanagari';
        return ws; // unique scripts: Georgian, Armenian, Hangul, Japanese, etc.
      }
      const fa = scriptFamily(sa), fb = scriptFamily(sb);
      if (fa !== fb) return 0.0;
      let score = 70;

      // ── Tier 2: Diacritic & Character Alignment (15 pts) ────────
      const pa = ORTHO_PROFILES[a] || { group: fa + '_default', consistency: 'medium' };
      const pb = ORTHO_PROFILES[b] || { group: fb + '_default', consistency: 'medium' };
      let alignment;
      if (pa.group === pb.group) {
        alignment = 'identical';
      } else {
        const k1 = pa.group + '|' + pb.group, k2 = pb.group + '|' + pa.group;
        alignment = (DIACRITIC_COMPAT.has(k1) || DIACRITIC_COMPAT.has(k2))
          ? 'minor_deviation' : 'major_deviation';
      }
      if (alignment === 'identical')        score += 15;
      else if (alignment === 'minor_deviation') score += 10;
      else                                  score += 5;

      // ── Tier 3: Phonetic Consistency Layer (15 pts) ─────────────
      const ca = pa.consistency, cb = pb.consistency;
      if (ca === 'high' && cb === 'high')   score += 15;
      else if (ca === 'low' || cb === 'low') score += 5;
      else                                  score += 10;

      return score / 100;
    },

    contactBonus(h, t) {
      const info = DATA.contact[h + '|' + t];
      return info ? [info.bonus, info.note] : [0, null];
    },

    combinedScore(target) {
      const dims = ['genealogical','lexical','grammatical','phonological','writing_system'];
      const best = {}; const helpers = {};
      for (const d of dims) { best[d] = 0; helpers[d] = null; }
      const notes = []; let totalBonus = 0;
      for (const h of this.speakers) {
        const m = CEFR_WEIGHTS[this.proficiency[h]] ?? 1.0;
        const sub = {
          genealogical:   this.genealogical(h, target) * m,
          lexical:        this.lexicalSimilarity(h, target) * m,
          grammatical:    this.grammatical(h, target) * m,
          phonological:   this.phonological(h, target) * m,
          writing_system: this.writingSystem(h, target) * m,
        };
        for (const d of dims) {
          if (sub[d] > best[d]) { best[d] = sub[d]; helpers[d] = h; }
        }
        const [b, n] = this.contactBonus(h, target);
        if (b) { totalBonus += b * m; notes.push({ helper: h, note: n }); }
      }
      const lexWithBonus = Math.min(1.0, best.lexical + totalBonus);
      const totalW = Object.values(this.weights).reduce((a, b) => a + b, 0) || 1;
      const w = {};
      for (const k of Object.keys(this.weights)) w[k] = this.weights[k] / totalW;
      const total =
        best.genealogical  * w.genealogical  +
        lexWithBonus       * w.lexical        +
        best.grammatical   * w.grammatical    +
        best.phonological  * w.phonological   +
        best.writing_system* w.writing_system;
      return {
        target, total, sub_scores: best, helpers_per_dim: helpers,
        lexical_with_contact_bonus: lexWithBonus,
        contact_bonus: totalBonus, contact_notes: notes,
      };
    },

    get recommendations() {
      if (this.speakers.length === 0) return [];
      const candidates = Object.keys(DATA.languages).filter(c => !this.speakers.includes(c));
      const scored = candidates.map(t => this.combinedScore(t));
      scored.sort((a, b) => b.total - a.total);
      return scored.slice(0, this.topN);
    },

    get displayRecommendations() {
      let recs = this.recommendations;
      if (this.fsiMaxTier > 0) {
        recs = recs.filter(r => (FSI_TIER[r.target] || 3) <= this.fsiMaxTier);
      }
      if (this.pinnedOnly) recs = recs.filter(r => this.pinned.includes(r.target));
      if (this.recSearch.trim()) {
        const q = this.recSearch.trim().toLowerCase();
        recs = recs.filter(r => {
          const en = (DATA.languages[r.target]?.name || r.target).toLowerCase();
          const native = (LANG_NATIVE[r.target] || '').toLowerCase();
          const family = (DATA.languages[r.target]?.family || '').toLowerCase();
          return en.includes(q) || native.includes(q) || family.includes(q) || r.target === q;
        });
      }
      return recs;
    },

    fsiLabel(code) {
      const t = FSI_TIER[code] || 3;
      const labels = ['', 'I', 'II', 'III', 'IV'];
      return { tier: t, cls: 'fsi-t' + t, label: 'Cat ' + labels[t] };
    },

    fsiHours(code) {
      // FSI classroom-hour estimates to ILR-3 / CEFR C1 professional proficiency
      const map = { 1: '~600 hrs', 2: '~900 hrs', 3: '~1,100 hrs', 4: '~2,200 hrs' };
      return map[FSI_TIER[code] || 3];
    },

    // ── Comparison feature ────────────────────────────────────────────────────

    toggleCompare(code) {
      if (this.compareSlots.includes(code)) {
        // Deselect
        this.compareSlots = this.compareSlots.filter(c => c !== code);
      } else if (this.compareSlots.length < 2) {
        this.compareSlots = [...this.compareSlots, code];
      } else {
        // Both slots full: drop the oldest, add the new pick
        this.compareSlots = [this.compareSlots[1], code];
      }
    },

    recForCode(code) {
      // Returns the scored rec object for any language code
      if (!code || !(code in DATA.languages)) return null;
      return this.recommendations.find(r => r.target === code)
          || this.combinedScore(code);
    },

    compareWinner(dimKey, codeA, codeB) {
      // Returns 'a', 'b', or 'tie'
      const recA = this.recForCode(codeA);
      const recB = this.recForCode(codeB);
      const val = (rec, k) =>
        k === 'total'   ? rec.total :
        k === 'lexical' ? rec.lexical_with_contact_bonus :
                          rec.sub_scores[k];
      const vA = val(recA, dimKey), vB = val(recB, dimKey);
      if (Math.abs(vA - vB) < 0.005) return 'tie';
      return vA > vB ? 'a' : 'b';
    },


    // ====== CANVAS SHARING ENGINE ======

    // Helper: rounded rectangle path (cross-browser)
    _rrect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },

    // Helper: draw a labelled progress bar (returns new y)
    _bar(ctx, x, y, w, label, pct, color) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,system-ui,sans-serif';
      ctx.fillText(label, x, y);
      ctx.fillStyle = '#1e293b'; ctx.fillRect(x, y + 3, w, 7);
      ctx.fillStyle = color; ctx.fillRect(x, y + 3, w * pct, 7);
      ctx.fillStyle = color; ctx.font = 'bold 10px Inter,system-ui,sans-serif';
      ctx.fillText(Math.round(pct * 100) + '%', x + w + 6, y + 11);
      return y + 22;
    },

    // Helper: wrap text, returns new y
    _wrapText(ctx, text, x, y, maxW, lineH) {
      const words = text.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, x, y); line = word; y += lineH;
        } else { line = test; }
      }
      if (line) { ctx.fillText(line, x, y); y += lineH; }
      return y;
    },

    // Helper: draw SVG map onto canvas at given rect
    async _drawMapToCanvas(ctx, svgStr, x, y, w, h) {
      if (!svgStr) return;
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      await new Promise((res) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, x, y, w, h); URL.revokeObjectURL(url); res(); };
        img.onerror = () => { URL.revokeObjectURL(url); res(); };
        img.src = url;
      });
    },

    // Build an inline-styled SVG map for canvas rendering (single language)
    buildShareMapSvg(code) {
      if (!this.geoReady || !this.geoData) return '';
      const recNums = new Set((SPEAKER_DATA[code]?.official || []).map(a2 => ISO_A2_TO_NUM[a2]).filter(Boolean));
      const knownNums = new Set(
        this.speakers.flatMap(spk => (SPEAKER_DATA[spk]?.official || []).map(a2 => ISO_A2_TO_NUM[a2]).filter(Boolean))
      );
      const W = 960, H = 480;
      let paths = '';
      for (const f of this.geoData) {
        if (!f.geometry) continue;
        const id = +f.id, isRec = recNums.has(id), isKnown = knownNums.has(id);
        const fill = isRec && isKnown ? '#a78bfa' : isRec ? '#34d399' : isKnown ? '#60a5fa' : '#3d3730';
        const sw = isRec || isKnown ? '0.8' : '0.3';
        let d = '';
        const geom = f.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
        for (const poly of polys) for (const ring of poly) d += this._geoRing(ring, W, H);
        if (d) paths += `<path fill="${fill}" stroke="#1c1917" stroke-width="${sw}" d="${d}"/>`;
      }
      return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#1e3a5f"/>${paths}</svg>`;
    },

    // Build an inline-styled SVG map for the Top 5 combined view
    buildTopFiveMapSvg() {
      if (!this.geoReady || !this.geoData) return '';
      const allNums = new Set(
        this.recommendations.slice(0, 5).flatMap(rec =>
          (SPEAKER_DATA[rec.target]?.official || []).map(a2 => ISO_A2_TO_NUM[a2]).filter(Boolean)
        )
      );
      const knownNums = new Set(
        this.speakers.flatMap(spk => (SPEAKER_DATA[spk]?.official || []).map(a2 => ISO_A2_TO_NUM[a2]).filter(Boolean))
      );
      const W = 960, H = 480;
      let paths = '';
      for (const f of this.geoData) {
        if (!f.geometry) continue;
        const id = +f.id, isRec = allNums.has(id), isKnown = knownNums.has(id);
        const fill = isRec && isKnown ? '#a78bfa' : isRec ? '#34d399' : isKnown ? '#60a5fa' : '#3d3730';
        const sw = isRec || isKnown ? '0.8' : '0.3';
        let d = '';
        const geom = f.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
        for (const poly of polys) for (const ring of poly) d += this._geoRing(ring, W, H);
        if (d) paths += `<path fill="${fill}" stroke="#1c1917" stroke-width="${sw}" d="${d}"/>`;
      }
      return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#1e3a5f"/>${paths}</svg>`;
    },

    // ── ENTRY POINT A: Top 5 Dashboard (800×1200 @ 2×) ─────────────────────
    async shareTopFive() {
      if (this.sharing || !this.recommendations.length) return;
      this.sharing = true;
      if (!this.geoReady) await this.loadGeoData();
      await document.fonts.ready;

      const S = 2, W = 800, H = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = W * S; canvas.height = H * S;
      const ctx = canvas.getContext('2d');
      ctx.scale(S, S);

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0f172a'); bg.addColorStop(0.45, '#052e16'); bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      let y = 0;

      // ── HEADER ──
      y = 46;
      ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 26px Inter,system-ui,sans-serif';
      ctx.fillText('MyNextLanguage', 32, y);
      y += 22;
      ctx.fillStyle = '#475569'; ctx.font = '12px Inter,system-ui,sans-serif';
      ctx.fillText('Your personalized language learning footprint', 32, y);
      y += 20;

      // Known language chips
      let chipX = 32;
      for (const spk of this.speakers) {
        const prof = this.proficiency[spk];
        const label = this.langName(spk) + (prof ? ' · ' + prof : '');
        ctx.font = '11px Inter,system-ui,sans-serif';
        const tw = ctx.measureText(label).width;
        const cw = tw + 18, ch = 20, cr = 5;
        this._rrect(ctx, chipX, y - 14, cw, ch, cr);
        ctx.fillStyle = '#1e3a5f'; ctx.fill();
        ctx.fillStyle = '#93c5fd'; ctx.fillText(label, chipX + 9, y + 1);
        chipX += cw + 7;
        if (chipX > W - 120) break;
      }
      y += 22;

      // Divider
      ctx.strokeStyle = '#1e3a2f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke();
      y += 18;

      ctx.fillStyle = '#34d399'; ctx.font = 'bold 10px Inter,system-ui,sans-serif';
      ctx.fillText('TOP 5 RECOMMENDATIONS', 32, y);
      y += 16;

      // ── TOP 5 ROWS ──
      const top5 = this.recommendations.slice(0, 5);
      const barColors = ['#059669', '#0284c7', '#7c3aed', '#d97706', '#dc2626'];
      const dimKeys = [
        r => r.lexical_with_contact_bonus,
        r => r.sub_scores.grammatical,
        r => r.sub_scores.phonological,
        r => r.sub_scores.writing_system,
        r => r.sub_scores.genealogical,
      ];
      const dimLabels = ['Lex', 'Gram', 'Sound', 'Script', 'Family'];

      for (let ri = 0; ri < top5.length; ri++) {
        const rec = top5[ri];
        const rowH = 108;
        const rowY = y;

        // Row background
        this._rrect(ctx, 32, rowY, W - 64, rowH - 6, 8);
        ctx.fillStyle = ri === 0 ? '#052e16' : '#0d1f14';
        ctx.fill();
        if (ri === 0) {
          ctx.strokeStyle = '#059669'; ctx.lineWidth = 1.5;
          this._rrect(ctx, 32, rowY, W - 64, rowH - 6, 8); ctx.stroke();
        }

        // Rank badge
        this._rrect(ctx, 44, rowY + 10, 30, 30, 6);
        ctx.fillStyle = ri === 0 ? '#059669' : '#1e3a2f'; ctx.fill();
        ctx.fillStyle = ri === 0 ? '#fff' : '#6ee7b7';
        ctx.font = 'bold 15px Inter,system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(ri + 1, 59, rowY + 31); ctx.textAlign = 'left';

        // Language name
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${ri === 0 ? 22 : 17}px Inter,system-ui,sans-serif`;
        ctx.fillText(this.langName(rec.target), 84, rowY + 27);

        // Branch · Family
        ctx.fillStyle = '#64748b'; ctx.font = '11px Inter,system-ui,sans-serif';
        ctx.fillText(this.branchName(rec.target) + ' · ' + this.familyName(rec.target), 84, rowY + 44);

        // Score badge
        const sx = W - 72;
        this._rrect(ctx, sx - 26, rowY + 10, 54, 30, 6);
        ctx.fillStyle = ri === 0 ? '#064e3b' : '#1e3a2f'; ctx.fill();
        ctx.fillStyle = ri === 0 ? '#6ee7b7' : '#4ade80';
        ctx.font = `bold ${ri === 0 ? 16 : 14}px Inter,system-ui,sans-serif`;
        ctx.textAlign = 'center'; ctx.fillText(rec.total.toFixed(2), sx, rowY + 30); ctx.textAlign = 'left';

        // Mini dimension bars
        const barsY = rowY + 57;
        const barsX = 84;
        const totalBarW = W - 64 - barsX - 70;
        const slotW = (totalBarW - 4 * 8) / 5;

        for (let di = 0; di < 5; di++) {
          const bx = barsX + di * (slotW + 8);
          const pct = dimKeys[di](rec);
          ctx.fillStyle = '#475569'; ctx.font = '8.5px Inter,system-ui,sans-serif';
          ctx.fillText(dimLabels[di], bx, barsY - 3);
          ctx.fillStyle = '#1e293b'; ctx.fillRect(bx, barsY, slotW, 5);
          ctx.fillStyle = barColors[di]; ctx.fillRect(bx, barsY, slotW * pct, 5);
          ctx.fillStyle = '#64748b'; ctx.font = '8.5px Inter,system-ui,sans-serif';
          ctx.fillText(Math.round(pct * 100) + '%', bx, barsY + 17);
        }
        y += rowH;
      }

      y += 12;

      // ── WORLD MAP ──
      ctx.strokeStyle = '#1e3a2f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke();
      y += 14;
      ctx.fillStyle = '#34d399'; ctx.font = 'bold 10px Inter,system-ui,sans-serif';
      ctx.fillText('COMBINED GLOBAL FOOTPRINT', 32, y);
      y += 12;

      const mapH = 224;
      await this._drawMapToCanvas(ctx, this.buildTopFiveMapSvg(), 32, y, W - 64, mapH);
      y += mapH + 14;

      // ── COMBINED STATS ──
      ctx.strokeStyle = '#1e3a2f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke();
      y += 14;
      ctx.fillStyle = '#34d399'; ctx.font = 'bold 10px Inter,system-ui,sans-serif';
      ctx.fillText('COMBINED REACH', 32, y);
      y += 18;

      let totalNative = 0, totalAll = 0;
      for (const rec of top5) {
        const sd = SPEAKER_DATA[rec.target];
        if (sd) { totalNative += sd.native || 0; totalAll += sd.total || 0; }
      }

      const statCols = [
        { label: 'Native speakers', value: this.fmtM(totalNative) },
        { label: 'Total speakers', value: this.fmtM(totalAll) },
        { label: 'Languages', value: String(top5.length) },
        { label: 'Avg score', value: (top5.reduce((a, r) => a + r.total, 0) / top5.length).toFixed(2) },
      ];
      const colW = (W - 64) / 4;
      for (let si = 0; si < statCols.length; si++) {
        const sx = 32 + si * colW;
        ctx.fillStyle = '#64748b'; ctx.font = '10px Inter,system-ui,sans-serif';
        ctx.fillText(statCols[si].label, sx, y);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px Inter,system-ui,sans-serif';
        ctx.fillText(statCols[si].value, sx, y + 22);
      }
      y += 48;

      // Language name tags
      y += 8;
      let tagX = 32;
      for (const rec of top5) {
        const name = this.langName(rec.target);
        ctx.font = '11px Inter,system-ui,sans-serif';
        const tw = ctx.measureText(name).width;
        const cw = tw + 16, ch = 20, cr = 4;
        this._rrect(ctx, tagX, y - 14, cw, ch, cr);
        ctx.fillStyle = '#064e3b'; ctx.fill();
        ctx.fillStyle = '#6ee7b7'; ctx.fillText(name, tagX + 8, y + 1);
        tagX += cw + 6;
      }
      y += 14;

      // Footer
      ctx.fillStyle = '#334155'; ctx.font = '11px Inter,system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('mynextlanguage.org', W / 2, H - 18); ctx.textAlign = 'left';

      // Export
      canvas.toBlob(async blob => {
        this.sharing = false;
        const file = new File([blob], 'my-top5-languages.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'MyNextLanguage', text: 'My top 5 languages to learn next! 🌍 Find yours at mynextlanguage.org', url: 'https://mynextlanguage.org/' }); } catch (_) {}
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'my-top5-languages.png'; a.click();
        }
      }, 'image/png');
    },

    // ── ENTRY POINT B: Individual Card (900×480 @ 2×) ───────────────────────
    async shareCardFootprint(code) {
      if (this.sharingCard === code) return;
      this.sharingCard = code;
      if (!this.geoReady) await this.loadGeoData();
      await document.fonts.ready;

      const rec = this.recommendations.find(r => r.target === code);
      if (!rec) { this.sharingCard = null; return; }

      const S = 2, W = 900, H = 480;
      const canvas = document.createElement('canvas');
      canvas.width = W * S; canvas.height = H * S;
      const ctx = canvas.getContext('2d');
      ctx.scale(S, S);

      // Background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#052e16');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const LW = 420;

      // App name (small)
      ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 14px Inter,system-ui,sans-serif';
      ctx.fillText('MyNextLanguage', 32, 34);

      // Language name
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px Inter,system-ui,sans-serif';
      ctx.fillText(this.langName(rec.target), 32, 76);

      // Branch · Family
      ctx.fillStyle = '#64748b'; ctx.font = '13px Inter,system-ui,sans-serif';
      ctx.fillText(this.branchName(rec.target) + ' · ' + this.familyName(rec.target), 32, 96);

      // Score badge
      const bx = LW - 60, by = 56;
      this._rrect(ctx, bx - 30, by - 26, 60, 32, 8);
      ctx.fillStyle = '#064e3b'; ctx.fill();
      ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 20px Inter,system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(rec.total.toFixed(2), bx, by); ctx.textAlign = 'left';

      // Divider
      ctx.strokeStyle = '#1e3a2f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32, 112); ctx.lineTo(LW - 16, 112); ctx.stroke();

      // Dimension bars
      const barDims = [
        { label: 'Lexicon',  color: '#059669', v: rec.lexical_with_contact_bonus },
        { label: 'Grammar',  color: '#0284c7', v: rec.sub_scores.grammatical },
        { label: 'Sounds',   color: '#7c3aed', v: rec.sub_scores.phonological },
        { label: 'Writing',  color: '#d97706', v: rec.sub_scores.writing_system },
        { label: 'Family',   color: '#dc2626', v: rec.sub_scores.genealogical },
      ];
      let barY = 126;
      const barW = LW - 80;
      for (const d of barDims) {
        barY = this._bar(ctx, 32, barY, barW, d.label, d.v, d.color);
      }

      // Speaker stats
      const sd = SPEAKER_DATA[code];
      if (sd) {
        barY += 8;
        ctx.strokeStyle = '#1e3a2f'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, barY); ctx.lineTo(LW - 16, barY); ctx.stroke();
        barY += 14;
        const stats = [
          { label: 'Native', val: this.fmtM(sd.native) },
          { label: 'Total',  val: this.fmtM(sd.total) },
          { label: 'Countries', val: sd.official?.length ? sd.official.length + '' : '—' },
        ];
        let sx = 32;
        for (const st of stats) {
          ctx.fillStyle = '#64748b'; ctx.font = '10px Inter,system-ui,sans-serif';
          ctx.fillText(st.label, sx, barY);
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Inter,system-ui,sans-serif';
          ctx.fillText(st.val, sx, barY + 18);
          sx += (LW - 48) / 3;
        }
      }

      // URL
      ctx.fillStyle = '#334155'; ctx.font = '11px Inter,system-ui,sans-serif';
      ctx.fillText('mynextlanguage.org', 32, H - 18);

      // World map (right panel)
      const mapX = LW + 8, mapY = 12, mapW = W - mapX - 12, mapH = H - 50;
      await this._drawMapToCanvas(ctx, this.buildShareMapSvg(code), mapX, mapY, mapW, mapH);

      // Map legend
      const leg = [
        { color: '#34d399', label: this.langName(code) },
        { color: '#60a5fa', label: 'Known' },
        { color: '#a78bfa', label: 'Both' },
      ];
      let lx = mapX, ly = H - 20;
      for (const l of leg) {
        ctx.fillStyle = l.color; ctx.fillRect(lx, ly - 8, 10, 9);
        ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,system-ui,sans-serif';
        ctx.fillText(l.label, lx + 13, ly);
        lx += ctx.measureText(l.label).width + 28;
      }

      // Export
      canvas.toBlob(async blob => {
        this.sharingCard = null;
        const name = this.langName(code).toLowerCase().replace(/\s+/g, '-');
        const file = new File([blob], `mynextlanguage-${name}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'MyNextLanguage', text: `I'm learning ${this.langName(code)} next! 🌍 Find yours at mynextlanguage.org`, url: 'https://mynextlanguage.org/' }); } catch (_) {}
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = `mynextlanguage-${name}.png`; a.click();
        }
      }, 'image/png');
    },


    // ── Newsletter Signup ─────────────────────────────────────────────────────
    async emailSubscribe() {
      const email = (this.emailInput || '').trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        this.emailStatus = 'error';
        this.emailMsg = 'Please enter a valid email address.';
        return;
      }
      this.emailStatus = 'loading';
      this.emailMsg = '';
      umamiTrack('subscribe_newsletter', { email_domain: email.split('@')[1] || '' });
      try {
        const body = new URLSearchParams({ email });
        const res = await fetch(
          'https://buttondown.com/api/emails/embed-subscribe/mynextlanguage',
          { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        if (res.ok || res.status === 201) {
          this.emailStatus = 'success';
          this.emailMsg = '🎉 You\'re in! Check your inbox to confirm.';
          this.emailInput = '';
        } else {
          const data = await res.json().catch(() => ({}));
          this.emailStatus = 'error';
          this.emailMsg = data?.email?.[0] || 'Something went wrong. Please try again.';
        }
      } catch (e) {
        this.emailStatus = 'error';
        this.emailMsg = 'Network error — please try again.';
      }
    },

    // ── Persistence & bookmarking ─────────────────────────────────────────────

    loadProfile() {
      try {
        const sp = localStorage.getItem('lb-speakers');
        if (sp) {
          const arr = JSON.parse(sp).filter(c => c in DATA.languages);
          if (arr.length) this.speakers = arr;
        }
        const pr = localStorage.getItem('lb-proficiency');
        if (pr) {
          const obj = JSON.parse(pr);
          const filtered = {};
          for (const c of this.speakers) { if (obj[c]) filtered[c] = obj[c]; }
          if (Object.keys(filtered).length) this.proficiency = filtered;
        }
        const pi = localStorage.getItem('lb-pinned');
        if (pi) {
          this.pinned = JSON.parse(pi).filter(c => c in DATA.languages);
        }
        const pn = localStorage.getItem('lb-pinned-notes');
        if (pn) this.pinnedNotes = JSON.parse(pn);
        const ls = localStorage.getItem('lb-status');
        if (ls) this.learningStatus = JSON.parse(ls);
      } catch (_) {}
    },

    persistProfile() {
      try {
        localStorage.setItem('lb-speakers',      JSON.stringify(this.speakers));
        localStorage.setItem('lb-proficiency',   JSON.stringify(this.proficiency));
        localStorage.setItem('lb-pinned',        JSON.stringify(this.pinned));
        localStorage.setItem('lb-pinned-notes',  JSON.stringify(this.pinnedNotes));
        localStorage.setItem('lb-status',        JSON.stringify(this.learningStatus));
      } catch (_) {}
      this.showSavedToast();
    },

    // ── URL state: encode speakers / proficiency / weights / open card ─────────
    // Format: #langs=en,de&prof=C2,B1&w=35,25,10,10,20&target=pl
    syncToUrl() {
      const parts = [];

      if (this.speakers.length) {
        parts.push('langs=' + this.speakers.join(','));
        const profs = this.speakers.map(c => this.proficiency[c] || '').join(',');
        // Only include prof segment if at least one level is set
        if (profs.replace(/,/g, '')) parts.push('prof=' + profs);
      }

      // Only include weights when they differ from defaults
      const dw = DEFAULT_WEIGHTS, w = this.weights;
      if (!Object.keys(dw).every(k => dw[k] === w[k])) {
        parts.push('w=' + [w.lexical, w.grammatical, w.phonological, w.writing_system, w.genealogical].join(','));
      }

      if (this.selectedCard) parts.push('target=' + this.selectedCard);

      if (this.compareSlots.length) parts.push('cmp=' + this.compareSlots.join(','));

      const hash = parts.length ? '#' + parts.join('&') : '';
      history.replaceState(null, '', location.pathname + location.search + hash);
    },

    readFromUrl() {
      const raw = location.hash.slice(1); // strip leading #
      if (!raw) return false;

      const params = {};
      for (const seg of raw.split('&')) {
        const eq = seg.indexOf('=');
        if (eq > 0) {
          try {
            params[decodeURIComponent(seg.slice(0, eq))] = decodeURIComponent(seg.slice(eq + 1));
          } catch (_) {}
        }
      }

      let found = false;

      // Speakers
      if (params.langs) {
        const codes = params.langs.split(',').filter(c => c in DATA.languages);
        if (codes.length) {
          this.speakers = codes;
          found = true;

          if (params.prof) {
            const VALID_CEFR = new Set(['A1','A2','B1','B2','C1','C2']);
            const levels = params.prof.split(',');
            const prof = {};
            codes.forEach((c, i) => { if (VALID_CEFR.has(levels[i])) prof[c] = levels[i]; });
            if (Object.keys(prof).length) this.proficiency = prof;
          }
        }
      }

      // Weights
      if (params.w) {
        const vals = params.w.split(',').map(Number);
        if (vals.length === 5 && vals.every(v => !isNaN(v) && v >= 0)) {
          this.weights = {
            lexical: vals[0], grammatical: vals[1], phonological: vals[2],
            writing_system: vals[3], genealogical: vals[4]
          };
          found = true;
        }
      }

      // Open card permalink — defer one tick so recommendations have rendered
      if (params.target && params.target in DATA.languages) {
        this.$nextTick(() => {
          this.selectedCard = params.target;
          if (!this.geoReady && !this.mapLoading) this.loadGeoData();
        });
      }

      // Restore compare slots
      if (params.cmp) {
        const slots = params.cmp.split(',').filter(c => c in DATA.languages).slice(0, 2);
        if (slots.length) { this.compareSlots = slots; found = true; }
      }

      return found;
    },

    showSavedToast() {
      this.savedToast = true;
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.savedToast = false; }, 1800);
    },

    applySwUpdate() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          // Reload once the new SW takes control
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
          // Fallback: reload immediately if no waiting worker (already activated)
          if (!reg || !reg.waiting) location.reload();
        });
      } else {
        location.reload();
      }
    },

    togglePin(code) {
      if (this.pinned.includes(code)) {
        this.pinned = this.pinned.filter(c => c !== code);
      } else {
        this.pinned = [...this.pinned, code];
        umamiTrack('pin_language', { language_code: code, language_name: this.langName(code) });
      }
      this.persistProfile();
    },

    clearProfile() {
      if (!confirm('Reset your speaker profile and clear all bookmarks?')) return;
      this.speakers    = ['en'].filter(c => c in DATA.languages);
      this.proficiency = {};
      this.pinned      = [];
      this.pinnedOnly  = false;
      ['lb-speakers', 'lb-proficiency', 'lb-pinned'].forEach(k => localStorage.removeItem(k));
      this.showSavedToast();
    },

    // ====== EXPLANATION GENERATOR ======

    explain(rec) {
      const targetName = this.langName(rec.target);
      const hpd = rec.helpers_per_dim;
      const helperName = h => h ? this.langName(h) : '—';
      const s = rec.sub_scores;
      const parts = [];

      const genH = helperName(hpd.genealogical);
      if (s.genealogical === 1.0) parts.push(this.t('expSameSubbranch', {target: targetName, helper: genH}));
      else if (s.genealogical >= 0.7) parts.push(this.t('expSameBranch', {target: targetName, helper: genH}));
      else if (s.genealogical >= 0.4) {
        const fam = this.familyName(rec.target);
        parts.push(this.t('expSameFamily', {target: targetName, helper: genH, family: fam}));
      } else parts.push(this.t('expUnrelated', {target: targetName}));

      const lex = rec.lexical_with_contact_bonus;
      const lexH = helperName(hpd.lexical);
      const pct = Math.round(lex*100);
      if (lex >= 0.7) parts.push(this.t('expLexVeryHigh', {helper: lexH, pct}));
      else if (lex >= 0.4) parts.push(this.t('expLexHigh', {helper: lexH, pct}));
      else if (lex >= 0.2) parts.push(this.t('expLexModest', {pct}));
      else parts.push(this.t('expLexLow', {pct}));

      for (const n of rec.contact_notes) parts.push(n.note);

      const g = s.grammatical;
      const gH = helperName(hpd.grammatical);
      if (g >= 0.75) parts.push(this.t('expGramSimilar', {helper: gH}));
      else if (g >= 0.55) parts.push(this.t('expGramOverlap', {helper: gH}));
      else if (g >= 0.35) parts.push(this.t('expGramDiff'));
      else parts.push(this.t('expGramVeryDiff'));

      if (s.writing_system < 1.0) {
        if (s.writing_system === 0.0) parts.push(this.t('expScriptNew'));
        else parts.push(this.t('expScriptPartial'));
      }
      if (s.phonological >= 0.5) parts.push(this.t('expPhonSimilar'));
      else if (s.phonological < 0.1) parts.push(this.t('expPhonDiff'));

      return parts.join(' ');
    },

    formatSub(rec, key) {
      if (!rec || !rec.sub_scores) return '—';
      const v = key === 'lexical' ? (rec.lexical_with_contact_bonus ?? rec.sub_scores[key] ?? 0) : (rec.sub_scores[key] ?? 0);
      return (v ?? 0).toFixed(2);
    },

    radarSvg(rec) {
      // Safety guard: return empty SVG if rec is missing or malformed
      if (!rec || !rec.sub_scores) {
        return `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><circle cx="64" cy="64" r="48" fill="none" stroke="var(--radar-grid)" stroke-width="0.5"/></svg>`;
      }
      const dims = ['lexical','grammatical','phonological','writing_system','genealogical'];
      const labels = ['Lex','Gram','Phon','Script','Family'];
      const cx = 64, cy = 64, R = 48;
      const points = dims.map((d, i) => {
        const v = d === 'lexical' ? (rec.lexical_with_contact_bonus ?? rec.sub_scores[d] ?? 0) : (rec.sub_scores[d] ?? 0);
        const angle = (Math.PI*2 * i / dims.length) - Math.PI/2;
        const r = R * v;
        return [cx + Math.cos(angle)*r, cy + Math.sin(angle)*r];
      });
      const polygon = points.map(p => p.join(',')).join(' ');
      const axes = dims.map((_, i) => {
        const angle = (Math.PI*2 * i / dims.length) - Math.PI/2;
        const x = cx + Math.cos(angle)*R;
        const y = cy + Math.sin(angle)*R;
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--radar-grid)" stroke-width="0.5"/>`;
      }).join('');
      const labelEls = labels.map((label, i) => {
        const angle = (Math.PI*2 * i / dims.length) - Math.PI/2;
        const x = cx + Math.cos(angle)*(R+10);
        const y = cy + Math.sin(angle)*(R+10);
        return `<text x="${x}" y="${y}" font-size="8" fill="var(--radar-label)" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
      }).join('');
      return `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--radar-grid)" stroke-width="0.5"/>
        <circle cx="${cx}" cy="${cy}" r="${R*0.66}" fill="none" stroke="var(--radar-grid)" stroke-width="0.3"/>
        <circle cx="${cx}" cy="${cy}" r="${R*0.33}" fill="none" stroke="var(--radar-grid)" stroke-width="0.3"/>
        ${axes}
        <polygon points="${polygon}" fill="var(--radar-fill)" fill-opacity="0.25" stroke="var(--radar-fill)" stroke-width="1"/>
        ${labelEls}
      </svg>`;
    },
  };
}

// ── Expose to Alpine ──
window.app = app;
