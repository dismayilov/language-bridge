/* ──────────────────────────────────────────────────────────────────────────
 * profile.js — Shared user-profile module for MyNextLanguage.
 *
 * One unified localStorage blob (`mnl-profile`) read and written by every
 * surface (main app, quiz, pair-page micro-quizzes, recommendation modals).
 *
 * On first read, migrates legacy `lb-*` keys (speakers, proficiency, etc.)
 * into the unified shape, then keeps mirroring writes back to the legacy
 * keys so the main app's existing `loadProfile()` / `persistProfile()`
 * continue to work without modification.
 *
 * Exposed globals:
 *   window.MNLProfile = {
 *     get(), set(p), patch(partial),
 *     recordQuizAnswer(code, correct),
 *     recordQuizResult({ difficulty, score, streakHigh }),
 *     addLearning(code, cefr),
 *     subscribe(fn) -> unsubscribe()
 *   }
 * ──────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const KEY = 'mnl-profile';
  const VERSION = 1;
  const LEGACY = {
    speakers:       'lb-speakers',
    proficiency:    'lb-proficiency',
    pinned:         'lb-pinned',
    pinnedNotes:    'lb-pinned-notes',
    learningStatus: 'lb-status',
  };

  const DEFAULT_PROFILE = {
    version: VERSION,
    speakers: [],
    proficiency: {},
    pinned: [],
    pinnedNotes: {},
    learningStatus: {},
    quiz: {
      timesPlayed: 0,
      bestByDifficulty: { easy: 0, medium: 0, hard: 0, expert: 0, personal: 0 },
      // Per-category running totals (correct out of total attempts per category).
      byCategory: {
        languages:     { played: 0, correct: 0, attempted: 0 },
        geo:           { played: 0, correct: 0, attempted: 0 },
        geolinguistic: { played: 0, correct: 0, attempted: 0 },
        mixed:         { played: 0, correct: 0, attempted: 0 },
      },
      correctLangs: {},
      incorrectLangs: {},
      streakRecord: 0,
      lastDailyChallenge: null,
      lastPlayedAt: null,
    },
  };

  let _cached = null;
  const _listeners = new Set();

  // ── Internal: safe localStorage helpers ────────────────────────────────
  function _readKey(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function _writeKey(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }
  function _parseJSON(s, fallback) {
    if (!s) return fallback;
    try { return JSON.parse(s); } catch (_) { return fallback; }
  }

  // ── Internal: deep-merge for patch ─────────────────────────────────────
  function _isPlainObject(o) {
    return o && typeof o === 'object' && !Array.isArray(o);
  }
  function _merge(base, patch) {
    if (!_isPlainObject(patch)) return patch;
    const out = Object.assign({}, base);
    for (const k of Object.keys(patch)) {
      out[k] = _isPlainObject(base && base[k]) && _isPlainObject(patch[k])
        ? _merge(base[k], patch[k])
        : patch[k];
    }
    return out;
  }

  // ── Internal: migrate legacy lb-* keys (only once) ─────────────────────
  function _migrateLegacy(profile) {
    const out = Object.assign({}, profile);
    let migrated = false;
    if (!out.speakers || out.speakers.length === 0) {
      const sp = _parseJSON(_readKey(LEGACY.speakers), null);
      if (Array.isArray(sp) && sp.length) { out.speakers = sp; migrated = true; }
    }
    if (!out.proficiency || Object.keys(out.proficiency).length === 0) {
      const pr = _parseJSON(_readKey(LEGACY.proficiency), null);
      if (_isPlainObject(pr) && Object.keys(pr).length) { out.proficiency = pr; migrated = true; }
    }
    if (!out.pinned || out.pinned.length === 0) {
      const pn = _parseJSON(_readKey(LEGACY.pinned), null);
      if (Array.isArray(pn) && pn.length) { out.pinned = pn; migrated = true; }
    }
    if (!out.pinnedNotes || Object.keys(out.pinnedNotes).length === 0) {
      const pnn = _parseJSON(_readKey(LEGACY.pinnedNotes), null);
      if (_isPlainObject(pnn) && Object.keys(pnn).length) { out.pinnedNotes = pnn; migrated = true; }
    }
    if (!out.learningStatus || Object.keys(out.learningStatus).length === 0) {
      const ls = _parseJSON(_readKey(LEGACY.learningStatus), null);
      if (_isPlainObject(ls) && Object.keys(ls).length) { out.learningStatus = ls; migrated = true; }
    }
    if (migrated) {
      try {
        _writeKey(KEY, JSON.stringify(out));
      } catch (_) {}
    }
    return out;
  }

  // ── Internal: load profile fresh from storage ──────────────────────────
  function _load() {
    const raw = _parseJSON(_readKey(KEY), null);
    let profile = raw && _isPlainObject(raw)
      ? _merge(DEFAULT_PROFILE, raw)
      : Object.assign({}, DEFAULT_PROFILE);
    // Always run migration — if there's no MNL profile yet, this fills it
    // from legacy lb-* keys. If lb-* keys are empty too, no harm done.
    profile = _migrateLegacy(profile);
    // Reset quiz defaults (in case of older saved structures missing fields)
    profile.quiz = _merge(DEFAULT_PROFILE.quiz, profile.quiz || {});
    profile.version = VERSION;
    return profile;
  }

  // ── Internal: persist + mirror to legacy keys for app.js compatibility ─
  function _save(profile) {
    _cached = profile;
    try { _writeKey(KEY, JSON.stringify(profile)); } catch (_) {}
    // Mirror back to legacy keys so app.js's persistProfile/loadProfile
    // continue to behave as before, even if app.js doesn't use MNLProfile.
    _writeKey(LEGACY.speakers,       JSON.stringify(profile.speakers || []));
    _writeKey(LEGACY.proficiency,    JSON.stringify(profile.proficiency || {}));
    _writeKey(LEGACY.pinned,         JSON.stringify(profile.pinned || []));
    _writeKey(LEGACY.pinnedNotes,    JSON.stringify(profile.pinnedNotes || {}));
    _writeKey(LEGACY.learningStatus, JSON.stringify(profile.learningStatus || {}));
    // Notify subscribers
    _listeners.forEach(fn => { try { fn(profile); } catch (_) {} });
  }

  // ── Public API ─────────────────────────────────────────────────────────
  const MNLProfile = {
    /** Get the current profile (cached after first read). */
    get() {
      if (_cached) return _cached;
      _cached = _load();
      return _cached;
    },

    /** Replace the entire profile. */
    set(profile) {
      _save(_merge(DEFAULT_PROFILE, profile || {}));
      return _cached;
    },

    /** Shallow-merge updates into the profile (one or two levels deep). */
    patch(partial) {
      const next = _merge(this.get(), partial || {});
      _save(next);
      return _cached;
    },

    /** Record a single quiz answer (per-language correct/wrong counter). */
    recordQuizAnswer(code, correct) {
      if (!code) return this.get();
      const p = this.get();
      const bucket = correct ? 'correctLangs' : 'incorrectLangs';
      const map = Object.assign({}, p.quiz[bucket] || {});
      map[code] = (map[code] || 0) + 1;
      return this.patch({ quiz: { [bucket]: map, lastPlayedAt: Date.now() } });
    },

    /** Record the result of a finished quiz game. */
    recordQuizResult({ difficulty, score, streakHigh, category, total }) {
      const p = this.get();
      const best = Object.assign({}, p.quiz.bestByDifficulty || {});
      if (difficulty && (best[difficulty] || 0) < score) best[difficulty] = score;
      // Per-category running totals
      const byCat = Object.assign({}, p.quiz.byCategory || {});
      if (category) {
        const cur = byCat[category] || { played: 0, correct: 0, attempted: 0 };
        byCat[category] = {
          played: (cur.played || 0) + 1,
          correct: (cur.correct || 0) + (score || 0),
          attempted: (cur.attempted || 0) + (total || 10),
        };
      }
      return this.patch({
        quiz: {
          timesPlayed: (p.quiz.timesPlayed || 0) + 1,
          bestByDifficulty: best,
          byCategory: byCat,
          streakRecord: Math.max(p.quiz.streakRecord || 0, streakHigh || 0),
          lastPlayedAt: Date.now(),
        },
      });
    },

    /** Add a language to the learning list (or update its CEFR). */
    addLearning(code, cefr) {
      if (!code) return this.get();
      const p = this.get();
      const ls = Object.assign({}, p.learningStatus || {});
      ls[code] = { status: 'learning', cefr: cefr || 'A1', addedAt: Date.now() };
      return this.patch({ learningStatus: ls });
    },

    /** Subscribe to profile changes. Returns an unsubscribe function. */
    subscribe(fn) {
      if (typeof fn !== 'function') return function () {};
      _listeners.add(fn);
      return function () { _listeners.delete(fn); };
    },

    /** Force a fresh read from storage. */
    reload() {
      _cached = null;
      return this.get();
    },
  };

  window.MNLProfile = MNLProfile;
  MNLProfile.get();
})();
