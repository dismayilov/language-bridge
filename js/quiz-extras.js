/* ──────────────────────────────────────────────────────────────────────────
 * quiz-extras.js — Geography and Geo-Linguistic question generators for /quiz/.
 *
 * Mounts `window.QuizExtras` with:
 *   .generators  — object of generator functions added to the main quizApp's
 *                  `_generators` registry via Object.assign. Each is called
 *                  with `(pool, difficulty)` and `this` bound to the quizApp,
 *                  so it can read this.LANG_META, this.COUNTRY_DATA, etc.
 *   .loadCountries() → Promise<countryData>
 *   .typePlans   — weighted bags per category (languages/geo/geolinguistic/mixed)
 *
 * Question types contributed (correctKey is always a stable string):
 *
 *  Geography
 *   • flag_country    — show flag emoji, pick country
 *   • country_capital — show country, pick its capital
 *   • capital_country — show capital, pick its country
 *   • country_continent — pick which continent the country is in
 *   • driving_side    — pick which country drives on the left
 *   • continent_in    — "Which of these is in Africa?"
 *
 *  Geo-Linguistic
 *   • lang_country    — "Where is Pashto primarily spoken?"
 *   • country_lang    — "What's the most-spoken language in Bangladesh?"
 *   • not_official    — "Which of these does NOT have French as official?"
 *   • shared_language — "These three flags share a language. Which?"
 * ──────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  let _countryData = null;
  let _countryDataPromise = null;

  function loadCountries() {
    if (_countryData) return Promise.resolve(_countryData);
    if (_countryDataPromise) return _countryDataPromise;
    _countryDataPromise = fetch('/data/countries.json', { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        // Strip _meta key, return plain { code: {...} }
        const out = {};
        for (const k of Object.keys(d)) {
          if (!k.startsWith('_')) out[k] = d[k];
        }
        _countryData = out;
        return out;
      });
    return _countryDataPromise;
  }

  // ── Lightweight helpers (mirror what quizApp already has) ──────────────
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  // 4-option mode for Easy/Medium/Personal; 6-option mode for Hard/Expert
  function nDist(diff) { return (diff === 'hard' || diff === 'expert') ? 5 : 3; }

  // Country pool by difficulty — uses speaker_count proxy via UN-recognized
  // breadth. Easy = countries everyone has heard of, Hard/Expert = full set.
  const POPULAR_30 = ['US','GB','DE','FR','IT','ES','BR','RU','CN','JP','IN','CA','AU','MX','TR','KR','NL','SE','NO','DK','FI','PL','GR','EG','SA','ZA','AR','NG','TH','VN'];
  const POPULAR_70 = POPULAR_30.concat(['PT','BE','CH','AT','IE','CZ','HU','RO','UA','IL','AE','SG','MY','ID','PH','PK','BD','LK','NP','MM','KH','CO','PE','CL','VE','UY','EC','BO','MA','DZ','TN','KE','GH','SN','ET','TZ','UG','ZW','CU']);

  function countryPool(allCountries, diff) {
    if (diff === 'easy')   return POPULAR_30.filter(c => allCountries[c]);
    if (diff === 'medium') return POPULAR_70.filter(c => allCountries[c]);
    return Object.keys(allCountries);
  }

  // Resolve country name (with fallback)
  function cname(data, code) { return (data[code] && data[code].name) || code; }
  function cflag(data, code) { return (data[code] && data[code].flag) || '🌐'; }

  // ── Geography generators ───────────────────────────────────────────────
  const generators = {

    // Show a flag, pick the country
    flag_country(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const cpool = countryPool(data, diff);
      if (cpool.length < 4) return null;
      const code = pick(cpool);
      const others = sample(cpool.filter(c => c !== code), nDist(diff));
      const choices = shuffle([code, ...others]).map(c => ({ key: c, label: cname(data, c) }));
      return {
        type: 'flag_country',
        typeLabel: 'Flag → country',
        prompt: 'Whose flag is this?',
        bigText: cflag(data, code),
        bigStyle: 'native',
        choices,
        correctKey: code,
        correctLabel: cname(data, code),
        fact: cflag(data, code) + ' <strong>' + cname(data, code) + '</strong> &mdash; capital ' +
              data[code].capital + ', ' + data[code].continent + '.',
      };
    },

    // Show a country, pick its capital
    country_capital(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const cpool = countryPool(data, diff);
      if (cpool.length < 4) return null;
      const code = pick(cpool);
      const correctCap = data[code].capital;
      // Distractors: capitals of other countries in similar continent for harder rounds
      let distrPool;
      if (diff === 'hard' || diff === 'expert') {
        distrPool = cpool.filter(c => c !== code && data[c].continent === data[code].continent);
        if (distrPool.length < 3) distrPool = cpool.filter(c => c !== code);
      } else {
        distrPool = cpool.filter(c => c !== code);
      }
      const distrCodes = sample(distrPool, nDist(diff));
      const choices = shuffle([code, ...distrCodes]).map(c => ({
        key: data[c].capital, label: data[c].capital,
      }));
      return {
        type: 'country_capital',
        typeLabel: 'Capital city',
        prompt: 'What is the capital of <strong>' + cname(data, code) + '</strong>? ' + cflag(data, code),
        bigText: '',
        choices,
        correctKey: correctCap,
        correctLabel: correctCap,
        fact: cflag(data, code) + ' <strong>' + cname(data, code) + '</strong> &mdash; capital <strong>' +
              correctCap + '</strong>.',
      };
    },

    // Show a capital, pick its country
    capital_country(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const cpool = countryPool(data, diff);
      if (cpool.length < 4) return null;
      const code = pick(cpool);
      const others = sample(cpool.filter(c => c !== code), nDist(diff));
      const choices = shuffle([code, ...others]).map(c => ({
        key: c, label: cflag(data, c) + ' ' + cname(data, c),
      }));
      return {
        type: 'capital_country',
        typeLabel: 'Capital → country',
        prompt: '<strong>' + data[code].capital + '</strong> is the capital of which country?',
        bigText: '',
        choices,
        correctKey: code,
        correctLabel: cname(data, code),
        fact: cflag(data, code) + ' <strong>' + cname(data, code) + '</strong>, ' + data[code].continent + '.',
      };
    },

    // Show a country, pick its continent
    country_continent(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const cpool = countryPool(data, diff);
      if (cpool.length < 4) return null;
      const code = pick(cpool);
      const continents = ['Africa','Asia','Europe','North America','South America','Oceania'];
      const correct = data[code].continent;
      const others = continents.filter(c => c !== correct);
      const distractors = sample(others, nDist(diff));
      const choices = shuffle([correct, ...distractors]).map(c => ({ key: c, label: c }));
      return {
        type: 'country_continent',
        typeLabel: 'Continent',
        prompt: 'Which continent is <strong>' + cflag(data, code) + ' ' + cname(data, code) + '</strong> in?',
        bigText: '',
        choices,
        correctKey: correct,
        correctLabel: correct,
        fact: cflag(data, code) + ' <strong>' + cname(data, code) + '</strong> is in <strong>' +
              correct + '</strong>. Capital: ' + data[code].capital + '.',
      };
    },

    // Which of these drives on the left/right?
    driving_side(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const cpool = countryPool(data, diff);
      const left  = cpool.filter(c => data[c].driving === 'left');
      const right = cpool.filter(c => data[c].driving === 'right');
      if (left.length < 1 || right.length < 4) return null;
      // 50/50: ask "which drives on the LEFT" or "which on the RIGHT"
      const askLeft = Math.random() < 0.5;
      const oddCode = askLeft ? pick(left) : pick(right);
      const distrPool = askLeft ? right : left;
      if (distrPool.length < 3) return null;
      const distrCodes = sample(distrPool, nDist(diff));
      const choices = shuffle([oddCode, ...distrCodes]).map(c => ({
        key: c, label: cflag(data, c) + ' ' + cname(data, c),
      }));
      return {
        type: 'driving_side',
        typeLabel: 'Driving side',
        prompt: 'Which of these drives on the <strong>' + (askLeft ? 'left' : 'right') + '</strong> side of the road?',
        bigText: '',
        choices,
        correctKey: oddCode,
        correctLabel: cflag(data, oddCode) + ' ' + cname(data, oddCode),
        fact: cflag(data, oddCode) + ' <strong>' + cname(data, oddCode) + '</strong> drives on the ' +
              (askLeft ? 'left' : 'right') + '.',
      };
    },

    // Which of these is in [continent]?
    continent_in(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const cpool = countryPool(data, diff);
      const continents = ['Africa','Asia','Europe','North America','South America','Oceania'];
      const cont = pick(continents);
      const inCont = cpool.filter(c => data[c].continent === cont);
      const notIn = cpool.filter(c => data[c].continent !== cont);
      if (inCont.length < 1 || notIn.length < 3) return null;
      const oddCode = pick(inCont);
      const distrCodes = sample(notIn, nDist(diff));
      const choices = shuffle([oddCode, ...distrCodes]).map(c => ({
        key: c, label: cflag(data, c) + ' ' + cname(data, c),
      }));
      return {
        type: 'continent_in',
        typeLabel: 'In which continent',
        prompt: 'Which of these countries is in <strong>' + cont + '</strong>?',
        bigText: '',
        choices,
        correctKey: oddCode,
        correctLabel: cflag(data, oddCode) + ' ' + cname(data, oddCode),
        fact: cflag(data, oddCode) + ' <strong>' + cname(data, oddCode) + '</strong> &mdash; ' + cont +
              ', capital ' + data[oddCode].capital + '.',
      };
    },

    // ── Geo-Linguistic generators ─────────────────────────────────────────

    // "Where is [language] primarily spoken?"
    lang_country(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const spk = (window.__SPEAKER_DATA || {});
      const langs = Object.keys(spk).filter(l => spk[l].official && spk[l].official.length &&
        this.LANG_META[l] && data[spk[l].official[0]]);
      if (!langs.length) return null;
      const lang = pick(langs);
      const correctCode = spk[lang].official[0]; // First official country
      // Distractors: countries that are NOT in the language's official list
      const officialSet = new Set(spk[lang].official);
      const cpool = countryPool(data, diff);
      const distrPool = cpool.filter(c => !officialSet.has(c));
      if (distrPool.length < 3) return null;
      const distrCodes = sample(distrPool, nDist(diff));
      const choices = shuffle([correctCode, ...distrCodes]).map(c => ({
        key: c, label: cflag(data, c) + ' ' + cname(data, c),
      }));
      return {
        type: 'lang_country',
        typeLabel: 'Where is it spoken?',
        prompt: '<strong>' + this.LANG_META[lang].name + '</strong> is primarily spoken in which country?',
        bigText: '',
        choices,
        correctKey: correctCode,
        correctLabel: cflag(data, correctCode) + ' ' + cname(data, correctCode),
        fact: '<strong>' + this.LANG_META[lang].name + '</strong> is also official in: ' +
              spk[lang].official.slice(0, 5).map(c => cflag(data, c) + ' ' + cname(data, c)).join(', ') +
              (spk[lang].official.length > 5 ? '…' : '') + '.',
      };
    },

    // "What's the most-spoken language in [country]?"
    country_lang(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const spk = (window.__SPEAKER_DATA || {});
      // Build country → list of official languages, sorted by speakers_m
      const langByCountry = {};
      for (const lang of Object.keys(spk)) {
        if (!this.LANG_META[lang] || !spk[lang].official) continue;
        for (const c of spk[lang].official) {
          (langByCountry[c] = langByCountry[c] || []).push(lang);
        }
      }
      const cpool = countryPool(data, diff).filter(c => langByCountry[c] && langByCountry[c].length);
      if (cpool.length < 4) return null;
      const code = pick(cpool);
      // Pick the most-spoken official language as "correct"
      const ranked = langByCountry[code].slice().sort((a, b) =>
        (this.LANG_META[b].speakers_m || 0) - (this.LANG_META[a].speakers_m || 0));
      const correct = ranked[0];
      // Distractors: 3 random languages not official in this country
      const officialSet = new Set(langByCountry[code]);
      const distrPool = Object.keys(this.LANG_META).filter(l => !officialSet.has(l) && this.LANG_PHRASES[l]);
      if (distrPool.length < 3) return null;
      const distractors = sample(distrPool, nDist(diff));
      const choices = shuffle([correct, ...distractors]).map(l => ({
        key: l, label: this.LANG_META[l].name,
      }));
      return {
        type: 'country_lang',
        typeLabel: 'Main language',
        prompt: 'What is the most-spoken language in <strong>' + cflag(data, code) + ' ' + cname(data, code) + '</strong>?',
        bigText: '',
        choices,
        correctKey: correct,
        correctLabel: this.LANG_META[correct].name,
        fact: cflag(data, code) + ' <strong>' + cname(data, code) + '</strong> &mdash; <strong>' +
              this.LANG_META[correct].name + '</strong>' +
              (this.LANG_META[correct].speakers_m ? ' (~' + Math.round(this.LANG_META[correct].speakers_m) + 'M native speakers globally)' : '') + '.',
      };
    },

    // "Which of these does NOT have [language] as official?"
    not_official(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const spk = (window.__SPEAKER_DATA || {});
      // Find languages with 3+ official countries
      const langs = Object.keys(spk).filter(l => spk[l].official && spk[l].official.length >= 3 && this.LANG_META[l]);
      if (!langs.length) return null;
      const lang = pick(langs);
      const inOff = spk[lang].official.filter(c => data[c]);
      if (inOff.length < 3) return null;
      // 3 countries that DO speak it + 1 that doesn't
      const threeIn = sample(inOff, nDist(diff));
      const cpool = Object.keys(data);
      const notIn = cpool.filter(c => !spk[lang].official.includes(c));
      const odd = pick(notIn);
      const choices = shuffle([odd, ...threeIn]).map(c => ({
        key: c, label: cflag(data, c) + ' ' + cname(data, c),
      }));
      return {
        type: 'not_official',
        typeLabel: 'Odd country out',
        prompt: 'Which of these does <strong>NOT</strong> have <strong>' + this.LANG_META[lang].name +
                '</strong> as an official language?',
        bigText: '',
        choices,
        correctKey: odd,
        correctLabel: cflag(data, odd) + ' ' + cname(data, odd),
        fact: '<strong>' + this.LANG_META[lang].name + '</strong> is official in ' +
              spk[lang].official.length + ' country' + (spk[lang].official.length === 1 ? '' : 's') +
              ' &mdash; ' + cflag(data, odd) + ' ' + cname(data, odd) + ' is not one of them.',
      };
    },

    // "These three flags share a language. Which?"
    shared_language(pool, diff) {
      const data = this.COUNTRY_DATA; if (!data) return null;
      const spk = (window.__SPEAKER_DATA || {});
      const langs = Object.keys(spk).filter(l => spk[l].official && spk[l].official.length >= 3 && this.LANG_META[l]);
      if (!langs.length) return null;
      const lang = pick(langs);
      const inOff = spk[lang].official.filter(c => data[c]);
      if (inOff.length < 3) return null;
      const trio = sample(inOff, 3);
      const flagsStr = trio.map(c => cflag(data, c)).join('  ');
      // Distractors: 3 other languages
      const distrPool = Object.keys(this.LANG_META).filter(l => l !== lang && this.LANG_PHRASES[l]);
      const distractors = sample(distrPool, nDist(diff));
      const choices = shuffle([lang, ...distractors]).map(l => ({
        key: l, label: this.LANG_META[l].name,
      }));
      return {
        type: 'shared_language',
        typeLabel: 'Shared language',
        prompt: 'These three countries share an official language. Which one?',
        bigText: flagsStr,
        bigStyle: 'native',
        choices,
        correctKey: lang,
        correctLabel: this.LANG_META[lang].name,
        fact: trio.map(c => cname(data, c)).join(', ') + ' all speak <strong>' +
              this.LANG_META[lang].name + '</strong> officially.',
      };
    },
  };

  // Per-category weight bags (used by quizApp to pick a varied 10-question set)
  const typePlans = {
    geo: {
      easy:    { flag_country: 3, country_capital: 3, capital_country: 2, country_continent: 2 },
      medium:  { flag_country: 2, country_capital: 2, capital_country: 2, country_continent: 1, driving_side: 1, continent_in: 1 },
      hard:    { flag_country: 1, country_capital: 2, capital_country: 2, country_continent: 1, driving_side: 1, continent_in: 1 },
      expert:  { flag_country: 1, country_capital: 2, capital_country: 1, driving_side: 2, continent_in: 2 },
    },
    geolinguistic: {
      easy:    { lang_country: 3, country_lang: 3, shared_language: 2 },
      medium:  { lang_country: 2, country_lang: 2, not_official: 2, shared_language: 1 },
      hard:    { lang_country: 2, country_lang: 1, not_official: 3, shared_language: 1 },
      expert:  { lang_country: 1, country_lang: 1, not_official: 4, shared_language: 1 },
    },
  };

  window.QuizExtras = {
    generators: generators,
    typePlans: typePlans,
    loadCountries: loadCountries,
  };
})();
