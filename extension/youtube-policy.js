(function(root) {
  'use strict';
  const MINUTE=60000, DAY=86400000;
  function dayKey(now) {
    const d=new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function initialState(now=Date.now()) {return {version:2,day:dayKey(now),requests:0,waitStartedAt:0,readyAt:0,ready:false,until:0};}
  function waitFor(requests) {return requests===0?10000:Math.min(DAY,30000*2**Math.min(20,requests-1));}
  function normalize(raw,now=Date.now()) {
    const state=initialState(now);
    if(![1,2].includes(raw?.version))return state;
    if(typeof raw.day==='string')state.day=raw.day;
    if(Number.isSafeInteger(raw.requests))state.requests=Math.max(0,Math.min(32,raw.requests));
    for(const key of ['waitStartedAt','readyAt','until'])if(Number.isFinite(raw[key]))state[key]=Math.max(0,raw[key]);
    state.ready=raw.version===2 && raw.ready===true;
    if(state.until>now){state.ready=false;state.readyAt=0;}
    if(state.readyAt){
      state.ready=false;
      if(!state.waitStartedAt || state.waitStartedAt>=state.readyAt)state.waitStartedAt=Math.max(0,state.readyAt-waitFor(Math.max(0,state.requests-1)));
    }else state.waitStartedAt=0;
    return state;
  }
  function reduce(raw,message={},now=Date.now()) {
    const state=normalize(raw,now);
    if(state.day!==dayKey(now)){state.day=dayKey(now);state.requests=0;}
    if(state.until<=now)state.until=0;
    if(state.readyAt && now>=state.readyAt){
      // Completing a wait unlocks one durable reveal; the minute has not started.
      state.ready=true;state.readyAt=0;state.waitStartedAt=0;
    }
    if(message.type==='REVEAL' && state.ready && !state.until){
      state.ready=false;state.until=now+MINUTE;
    }else if(message.type==='REQUEST' && !state.readyAt && !state.until && !state.ready){
      state.waitStartedAt=now;state.readyAt=now+waitFor(state.requests);state.requests++;
    }
    return {state};
  }
  const api={MINUTE,DAY,dayKey,initialState,normalize,waitFor,reduce};
  root.StillYouTubePolicy=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
