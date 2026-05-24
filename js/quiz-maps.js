/* ──────────────────────────────────────────────────────────────────────────
 * quiz-maps.js — Interactive world-map question generator for /quiz/.
 *
 * Lazy-loads d3 + topojson-client + the world-atlas TopoJSON (~250KB total,
 * SW-cacheable). Renders a 480x220 Natural-Earth-projected SVG world map
 * with one country highlighted in emerald; user picks the name from 4-6.
 *
 * Exposes:
 *   window.QuizMaps = {
 *     preload() → Promise          – ensures libs + atlas are loaded
 *     generators = { map_country, map_capital }
 *     typePlans  = { maps: { easy, medium, hard, expert } }
 *     renderHighlighted(numericId, opts) → svgString
 *   }
 *
 * Self-registers into window.QuizExtras after both modules have loaded so
 * the existing dispatch in quizApp._planQuestionTypes picks it up.
 * ──────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
  // Full d3@7 bundle (same URL the main app uses, so often cache-hits;
  // reliably exposes geoNaturalEarth1, geoPath, geoCentroid on window.d3).
  var D3_URL = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
  var TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';

  var _features = null;        // Cached GeoJSON FeatureCollection
  var _readyPromise = null;
  var _isoNumToA2 = null;      // numeric ISO → alpha2 reverse map

  function buildIsoMap() {
    if (_isoNumToA2) return _isoNumToA2;
    var a2ToNum = (window.__ISO_A2_TO_NUM || {});
    var out = {};
    for (var i = 0; i < Object.keys(a2ToNum).length; i++) {
      var a2 = Object.keys(a2ToNum)[i];
      out[String(a2ToNum[a2])] = a2;
    }
    _isoNumToA2 = out;
    return out;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function preload() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async function () {
      var tasks = [];
      if (!window.d3 || !window.d3.geoNaturalEarth1) tasks.push(loadScript(D3_URL));
      if (!window.topojson || !window.topojson.feature) tasks.push(loadScript(TOPOJSON_URL));
      await Promise.all(tasks);
      var res = await fetch(ATLAS_URL, { cache: 'force-cache' });
      if (!res.ok) throw new Error('atlas HTTP ' + res.status);
      var atlas = await res.json();
      _features = window.topojson.feature(atlas, atlas.objects.countries).features;
      buildIsoMap();
      return _features;
    })();
    return _readyPromise;
  }

  function renderHighlighted(numericId, opts) {
    opts = opts || {};
    var w = opts.w || 480;
    var h = opts.h || 220;
    if (!_features || !window.d3 || !window.d3.geoNaturalEarth1) return '';
    var target = null;
    for (var i = 0; i < _features.length; i++) {
      if (String(_features[i].id) === String(numericId)) { target = _features[i]; break; }
    }
    if (!target) return '';

    var projection = window.d3.geoNaturalEarth1()
      .scale(w / 6.4)
      .translate([w / 2, h / 1.85]);
    var pathGen = window.d3.geoPath(projection);

    var baseColor = '#27272a';
    var strokeColor = '#3f3f46';
    var accentColor = '#10b981';
    var accentStroke = '#34d399';
    var seaColor = '#0c0a09';

    var basePaths = '';
    for (var j = 0; j < _features.length; j++) {
      var feat = _features[j];
      if (String(feat.id) === String(numericId)) continue;
      var d = pathGen(feat);
      if (d) basePaths += '<path d="' + d + '" fill="' + baseColor + '" stroke="' + strokeColor + '" stroke-width="0.3"/>';
    }
    var targetD = pathGen(target);
    var targetPath = targetD
      ? '<path d="' + targetD + '" fill="' + accentColor + '" stroke="' + accentStroke + '" stroke-width="1.2"/>'
      : '';

    var dot = '';
    try {
      var c = pathGen.centroid(target);
      if (c && isFinite(c[0]) && isFinite(c[1])) {
        dot = '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) +
              '" r="6" fill="none" stroke="' + accentStroke + '" stroke-width="1.5" opacity="0.8"/>';
      }
    } catch (e) {}

    return (
      '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" ' +
      'style="display:block;width:100%;height:auto;max-height:280px;background:' + seaColor + ';' +
      'border-radius:10px;border:1px solid #292524">' +
      basePaths + targetPath + dot + '</svg>'
    );
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var k = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[k]; a[k] = t;
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  function nDist(diff) { return (diff === 'hard' || diff === 'expert') ? 5 : 3; }

  var POPULAR_EASY = ['US','GB','DE','FR','IT','ES','BR','RU','CN','JP','IN','CA','AU','MX','TR','KR','NL','SE','NO','EG','SA','ZA','AR','NG','TH','VN','GR','IR','PL','UA'];
  var POPULAR_MED = POPULAR_EASY.concat(['DK','FI','PT','BE','CH','AT','IE','CZ','HU','RO','IL','AE','SG','MY','ID','PH','PK','BD','LK','NP','MM','KH','CO','PE','CL','VE','UY','MA','DZ','TN','KE','GH','ET','TZ','UG','ZW','IQ','SY','CU']);

  function mappableCountries(diff) {
    if (!_features) return [];
    var a2Map = buildIsoMap();
    var data = (window.__COUNTRY_DATA || null);
    var result = [];
    for (var i = 0; i < _features.length; i++) {
      var f = _features[i];
      var a2 = a2Map[String(f.id)];
      if (!a2) continue;
      if (data && !data[a2]) continue;
      result.push({ a2: a2, numericId: String(f.id) });
    }
    if (diff === 'easy' || diff === 'medium') {
      var popular = (diff === 'easy') ? POPULAR_EASY : POPULAR_MED;
      var popSet = {};
      for (var p = 0; p < popular.length; p++) popSet[popular[p]] = 1;
      return result.filter(function (r) { return popSet[r.a2]; });
    }
    return result;
  }

  var generators = {

    map_country: function (pool, diff) {
      if (!_features) return null;
      var data = this.COUNTRY_DATA;
      if (!data) return null;
      var mappable = mappableCountries(diff);
      if (mappable.length < 4) return null;
      var target = pick(mappable);
      var others = sample(mappable.filter(function (r) { return r.a2 !== target.a2; }), nDist(diff));
      var choices = shuffle([target].concat(others)).map(function (r) {
        var flag = (data[r.a2] && data[r.a2].flag) ? data[r.a2].flag + ' ' : '';
        var name = (data[r.a2] && data[r.a2].name) || r.a2;
        return { key: r.a2, label: flag + name };
      });
      var svg = renderHighlighted(target.numericId, { w: 480, h: 220 });
      var cname = (data[target.a2] && data[target.a2].name) || target.a2;
      var cflag = (data[target.a2] && data[target.a2].flag) || '';
      var continent = (data[target.a2] && data[target.a2].continent) || '';
      var capital = (data[target.a2] && data[target.a2].capital) || '';
      return {
        type: 'map_country',
        typeLabel: 'Where on the map?',
        prompt: 'Which country is highlighted on the map?',
        bigText: '',
        displayHtml: svg,
        choices: choices,
        correctKey: target.a2,
        correctLabel: cflag + ' ' + cname,
        fact: cflag + ' <strong>' + cname + '</strong> — ' +
              (capital ? 'capital ' + capital + ', ' : '') + continent + '.'
      };
    },

    map_capital: function (pool, diff) {
      if (!_features) return null;
      var data = this.COUNTRY_DATA;
      if (!data) return null;
      var mappable = mappableCountries(diff);
      var withCap = mappable.filter(function (r) { return data[r.a2] && data[r.a2].capital; });
      if (withCap.length < 4) return null;
      var target = pick(withCap);
      var others = sample(withCap.filter(function (r) { return r.a2 !== target.a2; }), nDist(diff));
      var choices = shuffle([target].concat(others)).map(function (r) {
        return { key: data[r.a2].capital, label: data[r.a2].capital };
      });
      var svg = renderHighlighted(target.numericId, { w: 480, h: 220 });
      var cname = data[target.a2].name;
      return {
        type: 'map_capital',
        typeLabel: 'Capital of this country?',
        prompt: 'What is the capital of the highlighted country?',
        bigText: '',
        displayHtml: svg,
        choices: choices,
        correctKey: data[target.a2].capital,
        correctLabel: data[target.a2].capital,
        fact: (data[target.a2].flag || '') + ' <strong>' + cname + '</strong> — capital <strong>' +
              data[target.a2].capital + '</strong>.'
      };
    }
  };

  var typePlans = {
    maps: {
      easy:   { map_country: 6, map_capital: 2 },
      medium: { map_country: 5, map_capital: 3 },
      hard:   { map_country: 4, map_capital: 4 },
      expert: { map_country: 3, map_capital: 5 }
    }
  };

  window.QuizMaps = {
    preload: preload,
    generators: generators,
    typePlans: typePlans,
    renderHighlighted: renderHighlighted
  };

  function selfRegister() {
    if (!window.QuizExtras) return;
    for (var k in generators) { if (Object.prototype.hasOwnProperty.call(generators, k)) window.QuizExtras.generators[k] = generators[k]; }
    for (var t in typePlans) { if (Object.prototype.hasOwnProperty.call(typePlans, t)) window.QuizExtras.typePlans[t] = typePlans[t]; }
  }
  if (window.QuizExtras) {
    selfRegister();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', selfRegister);
  } else {
    setTimeout(selfRegister, 0);
  }
})();
