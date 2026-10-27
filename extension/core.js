(function (root) {
  'use strict';
  const REVEAL_TIME = 30000;
  const DAY = 24 * 60 * 60 * 1000;
  const FEATURES = ['reels', 'explore'];
  const LIMITS = { home: 10, reels: 10, carousel: 7 };
  function initialState() {
    return { version: 2, reveals: { reels: 0, explore: 0 },
      more: { windowStart: 0, requests: 0, readyAt: 0 },
      batches: { home: { seen: [], generation: 0 }, reels: { seen: [], generation: 0 } } };
  }
  function normalize(raw) {
    const state = initialState();
    if (!raw || ![1, 2].includes(raw.version)) return state;
    if (raw.version === 2) {
      for (const key of FEATURES) if (Number.isFinite(raw.reveals?.[key])) state.reveals[key] = Math.max(0, raw.reveals[key]);
      for (const key of ['windowStart', 'readyAt']) if (Number.isFinite(raw.more?.[key])) state.more[key] = Math.max(0, raw.more[key]);
      if (Number.isSafeInteger(raw.more?.requests)) state.more.requests = Math.max(0, Math.min(32, raw.more.requests));
    }
    for (const key of ['home', 'reels']) {
      const batch = raw.batches?.[key];
      state.batches[key].seen = [...new Set((Array.isArray(batch?.seen) ? batch.seen : []).filter(x => typeof x === 'string'))].slice(0, LIMITS[key]);
      state.batches[key].generation = Number.isSafeInteger(batch?.generation) && batch.generation >= 0 ? batch.generation : 0;
    }
    return state;
  }
  function waitFor(requests) {
    return requests === 0 ? 10000 : Math.min(DAY, 30000 * 2 ** Math.min(20, requests - 1));
  }
  function isRevealed(state, feature, now = Date.now()) { return FEATURES.includes(feature) && state.reveals[feature] > now; }
  function route(path) {
    if (/^\/stories(?:\/|$)/.test(path)) return 'stories';
    if (/^\/reels?(?:\/|$)/.test(path) || /^\/[^/]+\/reels?\/[^/]+(?:\/|$)/.test(path)) return 'reels';
    if (/^\/(?:explore|search)(?:\/|$)/.test(path)) return 'explore';
    return path === '/' ? 'home' : 'other';
  }
  function reduce(raw, message, now = Date.now()) {
    const state = normalize(raw);
    // Complete an already requested wait even if the popup/browser was closed.
    if (state.more.readyAt && now >= state.more.readyAt) {
      state.more.readyAt = 0;
      state.batches.reels = { seen: [], generation: state.batches.reels.generation + 1 };
    }
    const { type, feature } = message || {};
    if (type === 'SHOW' && FEATURES.includes(feature)) {
      state.reveals[feature] = now + REVEAL_TIME;
    } else if (type === 'MORE_REELS') {
      if (state.more.readyAt) return { state };
      if (state.batches.reels.seen.length < LIMITS.reels) return { state, error: 'Finish this batch before requesting more Reels.' };
      if (!state.more.windowStart || now - state.more.windowStart >= DAY) {
        state.more.windowStart = now;
        state.more.requests = 0;
      }
      state.more.readyAt = now + waitFor(state.more.requests);
      state.more.requests++;
    } else if (['UNLOCK', 'RESET_BATCH'].includes(type)) {
      return { state, error: 'Use Show Reels, Show Search, or More Reels in the popup.' };
    } else if (type === 'CONSUME' && ['home', 'reels'].includes(feature)) {
      const batch = state.batches[feature];
      if (message.generation !== batch.generation) return { state, allowed: false, stale: true };
      const id = typeof message.id === 'string' ? message.id.slice(0, 300) : '';
      if (!id) return { state, allowed: false };
      if (batch.seen.includes(id)) return { state, allowed: true };
      if (batch.seen.length >= LIMITS[feature]) return { state, allowed: false };
      batch.seen.push(id);
      return { state, allowed: true };
    }
    return { state };
  }
  const api = { REVEAL_TIME, DAY, FEATURES, LIMITS, initialState, normalize, isRevealed, waitFor, route, reduce };
  root.StillCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
