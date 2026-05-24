/* ──────────────────────────────────────────────────────────────────────────
 * micro-quiz.js — embeddable 3-question quiz module.
 *
 * Used by:
 *   • Every pair page (/from/<src>/to/<tgt>/index.html) — pair mode
 *   • Recommendation-card "Test yourself" modal on the main app — target mode
 *
 * Self-contained, no Alpine required. Lazy-loads /data/languages-matrix.json
 * on first mount and caches it. Reads/writes to window.MNLProfile if present.
 *
 * Public API:
 *   MicroQuiz.mount(container, options)
 *     container : Element | selector
 *     options.mode : 'pair' | 'target'
 *     options.source : ISO code (pair mode)
 *     options.target : ISO code (pair + target mode)
 *     options.onComplete : function({ score, total, correctLangs })
 *     options.compact : boolean  → hide extra chrome on pair pages
 * ──────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const DATA_URL = '/data/languages-matrix.json';

  // ── Compact false-friends bank — mirrors the full bank in /quiz/index.html.
  //    Used only when source ↔ target are both in this list.
  const FALSE_FRIENDS = [
    { word:'sklep',   a:'pl', mA:'shop',           b:'cs', mB:'cellar',         w:['attic','kitchen'] },
    { word:'pozor',   a:'cs', mA:'attention!',     b:'ru', mB:'shame/disgrace', w:['gaze','warning'] },
    { word:'uroda',   a:'pl', mA:'beauty',         b:'ru', mB:'ugly person',    w:['princess','gift'] },
    { word:'lustro',  a:'pl', mA:'mirror',         b:'ru', mB:'chandelier',     w:['glass','window'] },
    { word:'miasto',  a:'pl', mA:'city',           b:'ru', mB:'place',          w:['town','house'] },
    { word:'čerstvý', a:'cs', mA:'fresh',          b:'pl', mB:'stale',          w:['frozen','crusty'] },
    { word:'krásný',  a:'cs', mA:'beautiful',      b:'ru', mB:'red',            w:['noble','shining'] },
    { word:'Gift',    a:'en', mA:'present',        b:'de', mB:'poison',         w:['talent','package'] },
    { word:'bekommen',a:'de', mA:'to receive',     b:'en', mB:'to become',      w:['to give','to find'] },
    { word:'fast',    a:'en', mA:'quick',          b:'de', mB:'almost',         w:['rigid','fixed'] },
    { word:'bald',    a:'en', mA:'hairless',       b:'de', mB:'soon',           w:['brave','shiny'] },
    { word:'sensibel',a:'de', mA:'sensitive',      b:'en', mB:'reasonable',     w:['noticeable','visible'] },
    { word:'rolig',   a:'sv', mA:'funny',          b:'da', mB:'calm',           w:['silly','wild'] },
    { word:'slim',    a:'nl', mA:'clever',         b:'en', mB:'thin',           w:['slick','wet'] },
    { word:'embarazada', a:'es', mA:'pregnant',    b:'en', mB:'embarrassed',    w:['embargoed','tongue-tied'] },
    { word:'éxito',   a:'es', mA:'success',        b:'en', mB:'exit',           w:['exam','effort'] },
    { word:'ropa',    a:'es', mA:'clothes',        b:'en', mB:'rope',           w:['robe','soap'] },
    { word:'caldo',   a:'es', mA:'broth',          b:'it', mB:'hot',            w:['cold','thick'] },
    { word:'burro',   a:'es', mA:'donkey',         b:'it', mB:'butter',         w:['bull','horse'] },
    { word:'librairie', a:'fr', mA:'bookshop',     b:'en', mB:'library',        w:['liberty','liner'] },
    { word:'actuellement', a:'fr', mA:'currently', b:'en', mB:'actually',       w:['actively','occasionally'] },
    { word:'sensible',a:'fr', mA:'sensitive',      b:'en', mB:'reasonable',     w:['noticeable','invisible'] },
    { word:'raisin',  a:'fr', mA:'grape',          b:'en', mB:'dried grape',    w:['rice','rye'] },
  ];

  let _data = null;
  let _stylesInjected = false;

  // ── CSS (injected once, theme-aware via .dark class or prefers-color-scheme)
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const css = `
      .mnl-mq { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                border: 1px solid #d6d3d1; border-radius: 14px; padding: 18px 18px 16px;
                background: #fff; color: #1c1917; line-height: 1.5; }
      .dark .mnl-mq, [data-theme="dark"] .mnl-mq { background:#1c1917; color:#e7e5e4; border-color:#292524; }
      @media (prefers-color-scheme: dark) {
        html:not(.light) .mnl-mq { background:#1c1917; color:#e7e5e4; border-color:#292524; }
      }
      .mnl-mq-h { display:flex; align-items:center; justify-content:space-between; gap:12px;
                  margin-bottom: 12px; }
      .mnl-mq-title { font-weight: 600; font-size: 0.95rem; }
      .mnl-mq-chip { font-size:.65rem; letter-spacing:.06em; text-transform:uppercase;
                     font-weight:700; padding:.2rem .55rem; border-radius:9999px;
                     background:#f5f5f4; color:#78716c; }
      .dark .mnl-mq-chip { background:#292524; color:#a8a29e; }
      .mnl-mq-progress { height: 4px; border-radius: 9999px; background:#e7e5e4;
                         overflow:hidden; margin-bottom:14px; }
      .dark .mnl-mq-progress { background:#292524; }
      .mnl-mq-progress-bar { height:100%; background:#10b981; transition: width .25s ease-out; }
      .mnl-mq-prompt { font-size: 1rem; margin-bottom: 12px; }
      .mnl-mq-prompt strong { color:#0F6E56; font-weight:600; }
      .dark .mnl-mq-prompt strong { color:#34d399; }
      .mnl-mq-prompt em { font-style: italic; color:#78716c; }
      .dark .mnl-mq-prompt em { color:#a8a29e; }
      .mnl-mq-text { font-size: 1.25rem; font-weight: 500; margin: 4px 0 14px; line-height:1.35; }
      .mnl-mq-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      @media (max-width: 480px) { .mnl-mq-choices { grid-template-columns: 1fr; } }
      .mnl-mq-choice { text-align:left; padding: 10px 12px; border-radius:10px;
                       border: 2px solid #d6d3d1; background:transparent; color:inherit;
                       font: inherit; font-weight: 500; cursor: pointer;
                       transition: border-color .15s, background-color .15s, color .15s; }
      .dark .mnl-mq-choice { border-color: #44403c; }
      .mnl-mq-choice:not(:disabled):hover { border-color: #10b981; color:#0F6E56; }
      .dark .mnl-mq-choice:not(:disabled):hover { color:#34d399; }
      .mnl-mq-choice.is-correct { border-color: #10b981; background: rgba(16,185,129,.15); color:#10b981; }
      .mnl-mq-choice.is-wrong   { border-color: #f87171; background: rgba(248,113,113,.15); color:#f87171; }
      .mnl-mq-choice.is-faded   { opacity: .35; }
      .mnl-mq-feedback { margin-top: 12px; padding: 10px 12px; border-radius: 10px;
                         font-size: 0.88rem; line-height:1.5; }
      .mnl-mq-feedback.ok  { background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.45); }
      .mnl-mq-feedback.bad { background: rgba(248,113,113,.12); border: 1px solid rgba(248,113,113,.45); }
      .mnl-mq-feedback-head { font-weight: 600; margin-bottom: 4px; }
      .mnl-mq-feedback.ok  .mnl-mq-feedback-head { color:#0F6E56; }
      .dark .mnl-mq-feedback.ok .mnl-mq-feedback-head { color:#34d399; }
      .mnl-mq-feedback.bad .mnl-mq-feedback-head { color:#dc2626; }
      .dark .mnl-mq-feedback.bad .mnl-mq-feedback-head { color:#f87171; }
      .mnl-mq-next { float:right; padding: 6px 12px; border-radius: 8px;
                     background:#10b981; color:#fff; border:0; font-weight:600; cursor:pointer;
                     margin-top: -2px; }
      .mnl-mq-next:hover { background:#0F6E56; }
      .mnl-mq-result { text-align:center; padding: 18px 12px 4px; }
      .mnl-mq-result-score { font-size: 2.5rem; font-weight: 700; line-height:1; margin-bottom:4px; color:#10b981; }
      .mnl-mq-result-sub { font-size: .9rem; color:#78716c; margin-bottom:16px; }
      .dark .mnl-mq-result-sub { color:#a8a29e; }
      .mnl-mq-cta-row { display:flex; flex-wrap: wrap; justify-content:center; gap: 8px; }
      .mnl-mq-cta { display:inline-block; padding: 8px 14px; border-radius: 8px;
                    font-size: .88rem; font-weight: 600; text-decoration: none;
                    border: 1px solid #d6d3d1; color: inherit; background:transparent; cursor:pointer;
                    font-family: inherit; }
      .dark .mnl-mq-cta { border-color: #44403c; }
      .mnl-mq-cta:hover { border-color:#10b981; color:#0F6E56; }
      .dark .mnl-mq-cta:hover { color:#34d399; }
      .mnl-mq-cta.primary { background:#10b981; color:#fff; border-color:#10b981; }
      .mnl-mq-cta.primary:hover { background:#0F6E56; border-color:#0F6E56; color:#fff; }
    `;
    const tag = document.createElement('style');
    tag.setAttribute('data-mnl-mq', 'true');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ── Random helpers ─────────────────────────────────────
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
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  // ── Data ───────────────────────────────────────────────
  function ensureData() {
    if (_data) return Promise.resolve(_data);
    return fetch(DATA_URL, { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        // Flatten lang metadata so generators can read uniformly
        const meta = {};
        const langs = (d.data && d.data.languages) || {};
        for (const code of Object.keys(langs)) {
          meta[code] = {
            name: langs[code].name || code,
            family: langs[code].family || '',
            branch: langs[code].branch || '',
            subbranch: langs[code].subbranch || '',
            writing_system: langs[code].writing_system || '',
            speakers_m: langs[code].speakers_m || null,
          };
        }
        _data = {
          meta: meta,
          phrases: d.lang_phrases || {},
          parallel: d.parallel_sentences || {},
          cognates: d.lsg_cognates || {},
          native: d.lang_native || {},
          flag: d.lang_flag || {},
          fsi: d.fsi_tier || {},
        };
        return _data;
      });
  }

  // ── Question builders ──────────────────────────────────

  // Cognate question between source and target (if curated data exists)
  function qCognate(src, tgt) {
    const k1 = src + '|' + tgt, k2 = tgt + '|' + src;
    const list = _data.cognates[k1] || _data.cognates[k2];
    if (!list || !list.length) return null;
    const reversed = !_data.cognates[k1];
    const c = pick(list);
    const a = reversed ? c.b : c.a;
    const b = reversed ? c.a : c.b;
    const distractorGlosses = list.filter(x => x.gloss !== c.gloss).map(x => x.gloss);
    let pool = distractorGlosses;
    const fallback = ['day','night','sun','moon','tree','child','book','water','house','road','star','river','bread','horse'];
    if (pool.length < 3) pool = pool.concat(fallback.filter(g => g !== c.gloss && !pool.includes(g)));
    const distractors = sample(pool, 3);
    const choices = shuffle([c.gloss, ...distractors]).map(g => ({ key: g, label: g }));
    return {
      type: 'cognate',
      typeLabel: 'Decode the cognate',
      prompt: 'In <strong>' + escapeHtml(_data.meta[src].name) + '</strong>: <em>' + escapeHtml(a) +
              '</em>. In <strong>' + escapeHtml(_data.meta[tgt].name) + '</strong>: <em>' + escapeHtml(b) +
              '</em>. Both mean&hellip;',
      bigText: '',
      choices: choices,
      correctKey: c.gloss,
      correctLabel: c.gloss,
      fact: 'Both inherited from a common ancestor in the <strong>' +
            escapeHtml(_data.meta[src].branch === _data.meta[tgt].branch
              ? _data.meta[src].branch
              : (_data.meta[src].family || 'same family')) + '</strong>.',
    };
  }

  // False friend between source and target (curated)
  function qFalseFriend(src, tgt) {
    const usable = FALSE_FRIENDS.filter(f =>
      (f.a === src && f.b === tgt) || (f.a === tgt && f.b === src));
    if (!usable.length) return null;
    const f = pick(usable);
    // Always frame the question so the user has to identify the meaning in
    // whichever language is the "other" one from the curated entry.
    const showA = (f.a === src) ? f : { word:f.word, a:f.b, b:f.a, mA:f.mB, mB:f.mA, w:f.w };
    // Pad to 3 distractors so we always get 4 options
    const padding = ['day','night','sun','moon','tree','book','water','road','star','river','horse','bread'];
    const distractors = showA.w.slice();
    while (distractors.length < 3) {
      const g = padding[Math.floor(Math.random() * padding.length)];
      if (g !== showA.mA && g !== showA.mB && distractors.indexOf(g) === -1) distractors.push(g);
    }
    const choices = shuffle([showA.mB].concat(distractors.slice(0, 3))).map(m => ({ key: m, label: m }));
    return {
      type: 'false_friend',
      typeLabel: 'False-friend trap',
      prompt: 'In <strong>' + escapeHtml(_data.meta[showA.a].name) + '</strong>, "<em>' + escapeHtml(showA.word) +
              '</em>" means <strong>' + escapeHtml(showA.mA) + '</strong>.<br>In <strong>' +
              escapeHtml(_data.meta[showA.b].name) + '</strong>, the same word actually means&hellip;',
      bigText: '',
      choices: choices,
      correctKey: showA.mB,
      correctLabel: showA.mB,
      fact: 'False friends like this trip up learners of related languages constantly.',
    };
  }

  // Closest sibling question: which is most closely related to the source?
  function qClosestTo(focus, pool) {
    const m = _data.meta[focus];
    if (!m) return null;
    const ranked = pool.filter(c => c !== focus).map(c => {
      const mm = _data.meta[c];
      let s = 0;
      if (mm.subbranch && mm.subbranch === m.subbranch) s = 4;
      else if (mm.branch && mm.branch === m.branch) s = 3;
      else if (mm.family && mm.family === m.family) s = 1;
      return { c, s };
    }).sort((a, b) => b.s - a.s);
    if (!ranked.length || ranked[0].s === 0) return null;
    const closest = ranked[0].c;
    const far = ranked.filter(r => r.s < 2);
    if (far.length < 3) return null;
    const distractors = sample(far, 3).map(r => r.c);
    const choices = shuffle([closest, ...distractors]).map(c => ({
      key: c, label: _data.meta[c].name + (_data.flag[c] ? ' ' + _data.flag[c] : '')
    }));
    return {
      type: 'closest_to',
      typeLabel: 'Closest relative',
      prompt: 'Of these four, which language is most closely related to <strong>' +
              escapeHtml(m.name) + '</strong>?',
      bigText: '',
      choices: choices,
      correctKey: closest,
      correctLabel: _data.meta[closest].name,
      fact: '<strong>' + escapeHtml(_data.meta[closest].name) + '</strong> shares ' +
            (_data.meta[closest].subbranch === m.subbranch ? 'the same subbranch' :
             _data.meta[closest].branch === m.branch ? 'the same branch (' + escapeHtml(m.branch) + ')' :
             'the same family') + ' with ' + escapeHtml(m.name) + '.',
    };
  }

  // Identify a sentence in the target language vs same-family distractors
  function qIdentify(focus, pool) {
    const phrases = _data.phrases[focus];
    if (!phrases || !phrases.p || !phrases.p.length) return null;
    const i = Math.floor(Math.random() * phrases.p.length);
    const phrase = phrases.p[i];
    const rom = (phrases.r && phrases.r[i]) || '';
    const m = _data.meta[focus];
    const sameBranch = pool.filter(c => c !== focus && _data.meta[c].branch === m.branch);
    const sameFam = pool.filter(c => c !== focus && _data.meta[c].family === m.family && !sameBranch.includes(c));
    let distPool = [...sameBranch, ...sameFam];
    if (distPool.length < 3) distPool = distPool.concat(pool.filter(c => c !== focus && !distPool.includes(c)));
    const distractors = sample(distPool, 3);
    const choices = shuffle([focus, ...distractors]).map(c => ({ key: c, label: _data.meta[c].name }));
    return {
      type: 'identify',
      typeLabel: 'What language is this?',
      prompt: 'Which of these does this sentence belong to?',
      bigText: phrase,
      subtitle: rom,
      choices: choices,
      correctKey: focus,
      correctLabel: _data.meta[focus].name,
      fact: '<strong>' + (_data.flag[focus] || '') + ' ' + escapeHtml(_data.meta[focus].name) + '</strong>' +
            (_data.native[focus] ? ' (' + escapeHtml(_data.native[focus]) + ')' : '') + ' &mdash; ' +
            escapeHtml(_data.meta[focus].family || '') +
            (_data.meta[focus].branch ? ' › ' + escapeHtml(_data.meta[focus].branch) : ''),
    };
  }

  // Native-name question
  function qNativeName(focus, pool) {
    const native = _data.native[focus];
    if (!native || native === _data.meta[focus].name) return null;
    const m = _data.meta[focus];
    const sameBranch = pool.filter(c => c !== focus && _data.meta[c].branch === m.branch);
    let distPool = sameBranch.slice();
    if (distPool.length < 3) distPool = distPool.concat(pool.filter(c => c !== focus && !distPool.includes(c)));
    const distractors = sample(distPool, 3);
    const choices = shuffle([focus, ...distractors]).map(c => ({ key: c, label: _data.meta[c].name }));
    return {
      type: 'native_name',
      typeLabel: 'Native name',
      prompt: 'A language calls itself this. Which one?',
      bigText: native,
      bigStyle: 'native',
      choices: choices,
      correctKey: focus,
      correctLabel: _data.meta[focus].name,
      fact: '<strong>' + (_data.flag[focus] || '') + ' ' + escapeHtml(_data.meta[focus].name) +
            '</strong> &mdash; speakers call it <em>' + escapeHtml(native) + '</em>.',
    };
  }

  // ── Question planning per mode ─────────────────────────
  function planQuestions(opts) {
    const allCodes = Object.keys(_data.meta);
    const questions = [];
    if (opts.mode === 'pair' && opts.source && opts.target &&
        _data.meta[opts.source] && _data.meta[opts.target]) {
      const s = opts.source, t = opts.target;
      // 1. Try false-friend specific to this pair
      const ff = qFalseFriend(s, t);
      if (ff) questions.push(ff);
      // 2. Cognate specific to this pair
      const cg = qCognate(s, t);
      if (cg) questions.push(cg);
      // 3. Identify target sentence
      const id = qIdentify(t, allCodes);
      if (id) questions.push(id);
      // 4. Closest relative to source (target hopefully scores well)
      if (questions.length < 3) {
        const cr = qClosestTo(s, allCodes);
        if (cr) questions.push(cr);
      }
      // 5. Fallback: native name of target
      if (questions.length < 3) {
        const nn = qNativeName(t, allCodes);
        if (nn) questions.push(nn);
      }
    } else if (opts.mode === 'target' && opts.target && _data.meta[opts.target]) {
      const t = opts.target;
      // 3 questions about the target alone
      const builders = [
        () => qIdentify(t, allCodes),
        () => qNativeName(t, allCodes),
        () => qClosestTo(t, allCodes),
      ];
      builders.forEach(b => { const q = b(); if (q) questions.push(q); });
    }
    // Generic fallback if planner produced fewer than 3
    while (questions.length < 3) {
      const code = opts.target || pick(allCodes);
      const q = qIdentify(code, allCodes);
      if (q) questions.push(q); else break;
    }
    return questions.slice(0, 3);
  }

  // ── Rendering ──────────────────────────────────────────
  function render(container, state) {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'mnl-mq';
    container.appendChild(root);

    if (state.phase === 'result') {
      renderResult(root, state);
    } else {
      renderQuestion(root, state);
    }
  }

  function renderQuestion(root, state) {
    const q = state.questions[state.idx];
    const headHtml = `
      <div class="mnl-mq-h">
        <div class="mnl-mq-title">${state.opts.mode === 'pair' ? 'Test your eye for this pair' : 'Quick check'}</div>
        <span class="mnl-mq-chip">${escapeHtml(q.typeLabel)}</span>
      </div>
      <div class="mnl-mq-progress">
        <div class="mnl-mq-progress-bar" style="width:${((state.idx + (state.feedback ? 1 : 0)) / state.questions.length) * 100}%"></div>
      </div>
      <div class="mnl-mq-prompt">${q.prompt}</div>
    `;
    const bigHtml = q.bigText
      ? `<div class="mnl-mq-text" ${q.bigStyle === 'native' ? 'style="font-size:1.9rem;font-weight:600;"' : ''}>${escapeHtml(q.bigText)}</div>`
      : '';
    const subHtml = q.subtitle
      ? `<div style="font-size:.85rem;font-style:italic;color:#78716c;margin-bottom:10px;">${escapeHtml(q.subtitle)}</div>`
      : '';

    const choicesHtml = '<div class="mnl-mq-choices">' + q.choices.map((c, i) => {
      let cls = 'mnl-mq-choice';
      if (state.feedback) {
        if (c.key === q.correctKey) cls += ' is-correct';
        else if (c.key === state.feedback.picked) cls += ' is-wrong';
        else cls += ' is-faded';
      }
      return `<button type="button" class="${cls}" data-key="${escapeHtml(c.key)}" ${state.feedback ? 'disabled' : ''}>
                <span style="opacity:.5;font-size:.75rem;margin-right:.35rem">${i + 1}.</span>${escapeHtml(c.label)}
              </button>`;
    }).join('') + '</div>';

    let feedbackHtml = '';
    if (state.feedback) {
      const ok = state.feedback.correct;
      feedbackHtml = `
        <div class="mnl-mq-feedback ${ok ? 'ok' : 'bad'}">
          <button type="button" class="mnl-mq-next" data-action="next">${state.idx + 1 === state.questions.length ? 'See result →' : 'Next →'}</button>
          <div class="mnl-mq-feedback-head">${ok ? 'Correct ✓' : 'It was ' + escapeHtml(q.correctLabel)}</div>
          <div>${q.fact || ''}</div>
        </div>`;
    }
    root.innerHTML = headHtml + bigHtml + subHtml + choicesHtml + feedbackHtml;

    // Wire choices
    root.querySelectorAll('.mnl-mq-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.feedback) return;
        const key = btn.getAttribute('data-key');
        const correct = key === q.correctKey;
        state.feedback = { picked: key, correct };
        q.userPicked = key;
        state.score += correct ? 1 : 0;
        if (correct) state.correctLangs.push(q.correctKey);
        // Record to profile
        try {
          if (window.MNLProfile && q.type === 'identify' && _data.meta[q.correctKey]) {
            window.MNLProfile.recordQuizAnswer(q.correctKey, correct);
          }
        } catch (_) {}
        render(state.container, state);
      });
    });
    // Wire next button
    const nextBtn = root.querySelector('[data-action="next"]');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        state.feedback = null;
        if (state.idx + 1 >= state.questions.length) state.phase = 'result';
        else state.idx += 1;
        render(state.container, state);
      });
    }
  }

  function renderResult(root, state) {
    const total = state.questions.length;
    const verdict = state.score === total ? 'Perfect.'
      : state.score >= 2                  ? 'Nicely done.'
      : 'Tough one — try the full quiz to practice.';

    // Build smart CTAs
    const ctas = [];
    if (state.opts.mode === 'pair') {
      ctas.push(`<a class="mnl-mq-cta primary" href="/?from=${encodeURIComponent(state.opts.source)}&learning=${encodeURIComponent(state.opts.target)}">Find more like ${escapeHtml(_data.meta[state.opts.target].name)} →</a>`);
      ctas.push(`<a class="mnl-mq-cta" href="/quiz/">Try the full quiz</a>`);
    } else if (state.opts.mode === 'target') {
      ctas.push(`<button type="button" class="mnl-mq-cta primary" data-action="add-learning">Add ${escapeHtml(_data.meta[state.opts.target].name)} to my learning list</button>`);
      ctas.push(`<a class="mnl-mq-cta" href="/quiz/">Try the full quiz</a>`);
    } else {
      ctas.push(`<a class="mnl-mq-cta primary" href="/quiz/">Try the full quiz</a>`);
    }

    root.innerHTML = `
      <div class="mnl-mq-result">
        <div class="mnl-mq-result-score">${state.score}/${total}</div>
        <div class="mnl-mq-result-sub">${verdict}</div>
        <div class="mnl-mq-cta-row">${ctas.join('')}</div>
      </div>
    `;

    // Wire "add to learning" button
    const add = root.querySelector('[data-action="add-learning"]');
    if (add) {
      add.addEventListener('click', () => {
        try {
          if (window.MNLProfile && state.opts.target) {
            window.MNLProfile.addLearning(state.opts.target, 'A1');
          }
        } catch (_) {}
        add.textContent = 'Added ✓';
        add.disabled = true;
      });
    }

    // Persist final result to profile (best-effort)
    try {
      if (window.MNLProfile) {
        window.MNLProfile.recordQuizResult({
          difficulty: 'micro',
          score: state.score,
          streakHigh: 0,
        });
      }
    } catch (_) {}

    if (typeof state.opts.onComplete === 'function') {
      try {
        state.opts.onComplete({
          score: state.score, total: total, correctLangs: state.correctLangs,
        });
      } catch (_) {}
    }
  }

  // ── Public API ─────────────────────────────────────────
  function mount(container, options) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;
    injectStyles();
    container.innerHTML = '<div style="padding:18px;font-size:.85rem;opacity:.6;text-align:center;">Loading mini-quiz&hellip;</div>';
    ensureData().then(() => {
      const questions = planQuestions(options || {});
      if (!questions.length) {
        container.innerHTML = '<div style="padding:16px;font-size:.85rem;opacity:.6;">Mini-quiz unavailable for this pair.</div>';
        return;
      }
      const state = {
        container, opts: options || {}, questions,
        idx: 0, phase: 'play', feedback: null,
        score: 0, correctLangs: [],
      };
      render(container, state);
    }).catch(err => {
      container.innerHTML = '<div style="padding:16px;font-size:.85rem;color:#dc2626;">Could not load mini-quiz data.</div>';
      console.error('[micro-quiz]', err);
    });
  }

  window.MicroQuiz = { mount: mount };

  // ── Auto-mount: any element with [data-micro-quiz] gets mounted on DOMContentLoaded.
  //   <div data-micro-quiz data-mq-mode="pair" data-mq-source="pl" data-mq-target="sk"></div>
  function autoMount() {
    const nodes = document.querySelectorAll('[data-micro-quiz]:not([data-mq-mounted])');
    nodes.forEach(n => {
      n.setAttribute('data-mq-mounted', '1');
      mount(n, {
        mode:   n.getAttribute('data-mq-mode') || 'target',
        source: n.getAttribute('data-mq-source') || null,
        target: n.getAttribute('data-mq-target') || null,
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
d])');
    nodes.forEach(n => {
      n.setAttribute('data-mq-mounted', '1');
      mount(n, {
        mode:   n.getAttribute('data-mq-mode') || 'target',
        source: n.getAttribute('data-mq-source') || null,
        target: n.getAttribute('data-mq-target') || null,
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
