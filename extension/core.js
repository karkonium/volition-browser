(function (root) {
  'use strict';
  const REVEAL_TIME = 30000;
  const DAY = 24 * 60 * 60 * 1000;
  const FEATURES = ['reels', 'explore'];
  const LIMITS = { home: 10, reels: 10, carousel: 7 };
  function waitFor(requests) {
    return requests === 0 ? 10000 : Math.min(DAY, 30000 * 2 ** Math.min(20, requests - 1));
  }
  function initialWait() { return {windowStart:0,requests:0,waitStartedAt:0,readyAt:0,ready:false}; }
  function initialState() {
    return {version:3,reveals:{reels:0,explore:0},
      navigation:{reels:initialWait(),explore:initialWait()},more:initialWait(),
      batches:{home:{seen:[],generation:0},reels:{seen:[],generation:0}}};
  }
  function normalizeWait(raw,readyAllowed) {
    const wait=initialWait();
    for(const key of ['windowStart','waitStartedAt','readyAt'])if(Number.isFinite(raw?.[key]))wait[key]=Math.max(0,raw[key]);
    if(Number.isSafeInteger(raw?.requests))wait.requests=Math.max(0,Math.min(32,raw.requests));
    wait.ready=readyAllowed && raw?.ready===true;
    if(wait.readyAt){
      wait.ready=false;
      if(!wait.waitStartedAt || wait.waitStartedAt>=wait.readyAt)wait.waitStartedAt=Math.max(0,wait.readyAt-waitFor(Math.max(0,wait.requests-1)));
    }else wait.waitStartedAt=0;
    return wait;
  }
  function normalize(raw) {
    const state=initialState();
    if(!raw || ![1,2,3].includes(raw.version))return state;
    if(raw.version>=2){
      for(const key of FEATURES)if(Number.isFinite(raw.reveals?.[key]))state.reveals[key]=Math.max(0,raw.reveals[key]);
      state.more=normalizeWait(raw.more,raw.version===3);
    }
    if(raw.version===3)for(const key of FEATURES)state.navigation[key]=normalizeWait(raw.navigation?.[key],true);
    for(const key of ['home','reels']){
      const batch=raw.batches?.[key];
      state.batches[key].seen=[...new Set((Array.isArray(batch?.seen)?batch.seen:[]).filter(x=>typeof x==='string'))].slice(0,LIMITS[key]);
      state.batches[key].generation=Number.isSafeInteger(batch?.generation) && batch.generation>=0?batch.generation:0;
    }
    return state;
  }
  function settleWait(wait,now) {
    if(wait.windowStart && now-wait.windowStart>=DAY){wait.windowStart=0;wait.requests=0;}
    if(wait.readyAt && now>=wait.readyAt){wait.readyAt=0;wait.waitStartedAt=0;wait.ready=true;}
  }
  function requestWait(wait,now) {
    if(wait.readyAt || wait.ready)return;
    if(!wait.windowStart)wait.windowStart=now;
    wait.waitStartedAt=now;wait.readyAt=now+waitFor(wait.requests);wait.requests++;
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
    for(const wait of [state.more,...FEATURES.map(key=>state.navigation[key])])settleWait(wait,now);
    const {type,feature}=message||{};
    if(type==='WAIT_SHOW' && FEATURES.includes(feature)){
      if(state.reveals[feature]<=now)requestWait(state.navigation[feature],now);
    }else if(type==='SHOW' && FEATURES.includes(feature)){
      const wait=state.navigation[feature];
      if(!wait.ready || state.reveals[feature]>now)return {state,error:'Finish the wait, then click to show this button.'};
      wait.ready=false;state.reveals[feature]=now+REVEAL_TIME;
    }else if(type==='MORE_REELS'){
      if(state.batches.reels.seen.length<LIMITS.reels)return {state,error:'Finish this batch before requesting more Reels.'};
      requestWait(state.more,now);
    }else if(type==='CLAIM_REELS'){
      if(!state.more.ready || state.batches.reels.seen.length<LIMITS.reels)return {state,error:'Finish the wait, then click More Reels.'};
      state.more.ready=false;
      state.batches.reels={seen:[],generation:state.batches.reels.generation+1};
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
  const api = { REVEAL_TIME, DAY, FEATURES, LIMITS, initialWait, initialState, normalize, isRevealed, waitFor, route, reduce };
  root.StillCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
