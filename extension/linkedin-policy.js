(function(root){
  'use strict';
  const FEATURES=['home','network'],LIMITS={home:10,network:3},DURATIONS={home:300000,network:300000};
  function initialState(){return {version:1,home:{until:0,generation:0,seen:[]},network:{until:0,generation:0,seen:[]}};}
  function normalize(raw){
    const state=initialState();if(raw?.version!==1)return state;
    for(const feature of FEATURES){const input=raw[feature];
      if(Number.isFinite(input?.until))state[feature].until=Math.max(0,input.until);
      if(Number.isSafeInteger(input?.generation))state[feature].generation=Math.max(0,input.generation);
      state[feature].seen=[...new Set((Array.isArray(input?.seen)?input.seen:[]).filter(id=>typeof id==='string' && /^[a-f0-9]{16}$/.test(id)))].slice(0,LIMITS[feature]);
    }return state;
  }
  function reduce(raw,message={},now=Date.now()){
    const state=normalize(raw);
    for(const feature of FEATURES)if(state[feature].until<=now)state[feature].until=0;
    const {type,feature}=message;
    if(!FEATURES.includes(feature))return {state};
    const batch=state[feature];
    if(type==='UNLOCK' && !batch.until){batch.until=now+DURATIONS[feature];batch.generation++;batch.seen=[];}
    else if(type==='HIDE')batch.until=0;
    else if(type==='CONSUME'){
      if(!batch.until)return {state,allowed:false};
      if(message.generation!==batch.generation)return {state,allowed:false,stale:true};
      if(typeof message.id!=='string' || !/^[a-f0-9]{16}$/.test(message.id))return {state,allowed:false};
      if(batch.seen.includes(message.id))return {state,allowed:true};
      if(batch.seen.length>=LIMITS[feature])return {state,allowed:false};
      batch.seen.push(message.id);return {state,allowed:true};
    }return {state};
  }
  const api={FEATURES,LIMITS,DURATIONS,initialState,normalize,reduce};root.FiniteLinkedInPolicy=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
