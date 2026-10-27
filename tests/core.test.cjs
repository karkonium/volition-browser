const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../extension/core.js');
const fill=(state,now=1000)=>{for(let i=0;i<10;i++) state=C.reduce(state,{type:'CONSUME',feature:'reels',id:`${state.batches.reels.generation}-${i}`,generation:state.batches.reels.generation},now).state;return state;};
test('navigation reveal lasts thirty seconds and does not grant/reset Reels',()=>{
 let s=fill(C.initialState()); s=C.reduce(s,{type:'SHOW',feature:'reels'},1000).state;
 assert.equal(C.isRevealed(s,'reels',30999),true);assert.equal(C.isRevealed(s,'reels',31000),false);
 assert.equal(s.batches.reels.seen.length,10);assert.equal(s.more.requests,0);
});
test('ten unique Reels, replay permitted, eleventh denied without playback expiry',()=>{
 const s=fill(C.initialState());
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'reels',generation:0,id:'11'},C.DAY*10).allowed,false);
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'reels',generation:0,id:'0-9'},C.DAY*10).allowed,true);
});
test('wait sequence is 10s, 30s, 1m and then doubles',()=>{
 assert.deepEqual([0,1,2,3,4,5].map(C.waitFor),[10000,30000,60000,120000,240000,480000]);assert.equal(C.waitFor(32),C.DAY);
});
test('first More request cannot be skipped, repeated, or stockpiled',()=>{
 let s=fill(C.initialState());s=C.reduce(s,{type:'MORE_REELS'},1000).state;
 assert.equal(s.more.readyAt,11000);assert.equal(s.more.requests,1);
 assert.deepEqual(C.reduce(s,{type:'MORE_REELS'},2000).state,s);
 assert.equal(C.reduce(s,{type:'GET_STATE'},10999).state.batches.reels.seen.length,10);
 const result=C.reduce(s,{type:'GET_STATE'},11000).state;
 assert.equal(result.batches.reels.seen.length,0);assert.equal(result.batches.reels.generation,1);assert.equal(result.more.readyAt,0);
 assert.equal(C.reduce(result,{type:'CONSUME',feature:'reels',id:'x',generation:0},11000).stale,true);
});
test('wait survives serialized restart and renewal is exactly once',()=>{
 let s=C.reduce(fill(C.initialState()),{type:'MORE_REELS'},1000).state;
 s=C.reduce(JSON.parse(JSON.stringify(s)),{type:'GET_STATE'},11000).state;
 assert.equal(C.reduce(s,{type:'GET_STATE'},12000).state.batches.reels.generation,1);
 s=fill(s);s=C.reduce(s,{type:'MORE_REELS'},12000).state;assert.equal(s.more.readyAt,42000);
});
test('24-hour rolling window resets escalation without silently clearing consumption',()=>{
 let s=fill(C.initialState());s.more={windowStart:1000,requests:8,readyAt:0};
 assert.equal(C.reduce(s,{type:'GET_STATE'},C.DAY+1000).state.batches.reels.seen.length,10);
 s=C.reduce(s,{type:'MORE_REELS'},C.DAY+1000).state;assert.equal(s.more.requests,1);assert.equal(s.more.readyAt,C.DAY+11000);
});
test('partial batches and obsolete reset/unlock actions cannot bypass waiting',()=>{
 const s=C.initialState();assert.ok(C.reduce(s,{type:'MORE_REELS'},1000).error);
 for(const type of ['UNLOCK','RESET_BATCH']) assert.ok(C.reduce(fill(s),{type,feature:'reels'},1000).error);
});
test('v1 migration preserves usage and drops obsolete timers',()=>{
 const s=C.normalize({version:1,unlocks:{reels:999999,explore:999999},batches:{reels:{seen:['a'],generation:8}}});
 assert.equal(s.version,2);assert.deepEqual(s.reveals,{reels:0,explore:0});assert.deepEqual(s.batches.reels,{seen:['a'],generation:8});
});
test('Home admits ten unique posts and rejects the eleventh',()=>{
 let s=C.initialState();for(let i=0;i<10;i++){const result=C.reduce(s,{type:'CONSUME',feature:'home',generation:0,id:String(i)});assert.equal(result.allowed,true);s=result.state;}
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'home',generation:0,id:'10'}).allowed,false);
});
test('normalization handles corrupt state and routes keep social dialogs outside Search',()=>{
 assert.deepEqual(C.normalize({version:99}),C.initialState());
 assert.equal(C.route('/person/followers/'),'other');assert.equal(C.route('/person/following/'),'other');
 assert.equal(C.route('/reel/A/'),'reels');assert.equal(C.route('/person/reel/A/'),'reels');assert.equal(C.route('/person/reels/'),'other');assert.equal(C.route('/explore/'),'explore');
});
