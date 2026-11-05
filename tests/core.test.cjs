const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../extension/core.js');
const fill=(state,now=1000)=>{for(let i=0;i<10;i++)state=C.reduce(state,{type:'CONSUME',feature:'reels',id:`${state.batches.reels.generation}-${i}`,generation:state.batches.reels.generation},now).state;return state;};
test('Reels and Search each wait before an explicit thirty-second reveal',()=>{
 let s=fill(C.initialState());
 for(const feature of C.FEATURES){
  assert.ok(C.reduce(s,{type:'SHOW',feature},1000).error);
  s=C.reduce(s,{type:'WAIT_SHOW',feature},1000).state;
  assert.equal(s.navigation[feature].readyAt,11000);assert.equal(s.reveals[feature],0);
 }
 s=C.reduce(s,{type:'GET_STATE'},11000).state;
 assert.equal(s.navigation.reels.ready,true);assert.equal(s.navigation.explore.ready,true);
 s=C.reduce(s,{type:'SHOW',feature:'reels'},20000).state;
 assert.equal(C.isRevealed(s,'reels',49999),true);assert.equal(C.isRevealed(s,'reels',50000),false);
 assert.equal(s.navigation.explore.ready,true);assert.equal(s.reveals.explore,0);
 assert.ok(C.reduce(s,{type:'SHOW',feature:'reels'},25000).error);
 s=C.reduce(s,{type:'WAIT_SHOW',feature:'reels'},25000).state;assert.equal(s.navigation.reels.requests,1);
 s=C.reduce(s,{type:'WAIT_SHOW',feature:'reels'},50000).state;assert.equal(s.navigation.reels.readyAt,80000);
 assert.equal(s.batches.reels.seen.length,10);assert.equal(s.more.requests,0);
});
test('ten unique Reels, replay permitted, eleventh denied without playback expiry',()=>{
 const s=fill(C.initialState());
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'reels',generation:0,id:'11'},C.DAY*10).allowed,false);
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'reels',generation:0,id:'0-9'},C.DAY*10).allowed,true);
});
test('wait sequence is 10s, 30s, 1m then doubles',()=>{
 assert.deepEqual([0,1,2,3,4,5].map(C.waitFor),[10000,30000,60000,120000,240000,480000]);assert.equal(C.waitFor(32),C.DAY);
});
test('More Reels completion stays ready; only claiming resets the ten-Reel batch',()=>{
 let s=C.reduce(fill(C.initialState()),{type:'MORE_REELS'},1000).state;
 assert.equal(s.more.readyAt,11000);assert.equal(s.more.waitStartedAt,1000);assert.equal(s.more.requests,1);
 assert.deepEqual(C.reduce(s,{type:'MORE_REELS'},2000).state,s);
 assert.ok(C.reduce(s,{type:'CLAIM_REELS'},10000).error);
 s=C.reduce(s,{type:'GET_STATE'},11000).state;
 assert.equal(s.more.ready,true);assert.equal(s.batches.reels.seen.length,10);assert.equal(s.batches.reels.generation,0);
 assert.deepEqual(C.reduce(s,{type:'MORE_REELS'},12000).state,s);
 s=C.reduce(s,{type:'CLAIM_REELS'},3600000).state;
 assert.equal(s.batches.reels.seen.length,0);assert.equal(s.batches.reels.generation,1);assert.equal(s.more.ready,false);
 assert.ok(C.reduce(s,{type:'CLAIM_REELS'},3600001).error);
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'reels',id:'x',generation:0},3600001).stale,true);
});
test('all three ready buttons survive restart and 24-hour reset without activating',()=>{
 let s=fill(C.initialState());
 for(const feature of C.FEATURES)s=C.reduce(s,{type:'WAIT_SHOW',feature},1000).state;
 s=C.reduce(s,{type:'MORE_REELS'},1000).state;
 s=C.reduce(JSON.parse(JSON.stringify(s)),{type:'GET_STATE'},C.DAY+2000).state;
 for(const wait of [s.more,...C.FEATURES.map(key=>s.navigation[key])]){assert.equal(wait.ready,true);assert.equal(wait.requests,0);assert.equal(wait.readyAt,0);}
 assert.deepEqual(s.reveals,{reels:0,explore:0});assert.equal(s.batches.reels.seen.length,10);
 s=C.reduce(s,{type:'CLAIM_REELS'},C.DAY+3000).state;s=fill(s,C.DAY+3000);
 s=C.reduce(s,{type:'MORE_REELS'},C.DAY+4000).state;assert.equal(s.more.readyAt,C.DAY+14000);
});
test('partial batches and obsolete reset/unlock actions cannot bypass waiting',()=>{
 const s=C.initialState();assert.ok(C.reduce(s,{type:'MORE_REELS'},1000).error);assert.ok(C.reduce(s,{type:'CLAIM_REELS'},1000).error);
 for(const type of ['UNLOCK','RESET_BATCH'])assert.ok(C.reduce(fill(s),{type,feature:'reels'},1000).error);
});
test('old state migrations preserve consumption and pending More Reels waits',()=>{
 let s=C.normalize({version:1,unlocks:{reels:999999},batches:{reels:{seen:['a'],generation:8}}});
 assert.equal(s.version,3);assert.deepEqual(s.reveals,{reels:0,explore:0});assert.deepEqual(s.batches.reels,{seen:['a'],generation:8});
 s=C.reduce({version:2,reveals:{reels:40000,explore:0},more:{windowStart:1000,requests:1,readyAt:11000},batches:fill(C.initialState()).batches},{type:'GET_STATE'},20000).state;
 assert.equal(s.more.ready,true);assert.equal(s.batches.reels.seen.length,10);assert.equal(s.batches.reels.generation,0);assert.equal(s.reveals.reels,40000);
});
test('Home admits ten unique posts and rejects the eleventh',()=>{
 let s=C.initialState();for(let i=0;i<10;i++){const r=C.reduce(s,{type:'CONSUME',feature:'home',generation:0,id:String(i)});assert.equal(r.allowed,true);s=r.state;}
 assert.equal(C.reduce(s,{type:'CONSUME',feature:'home',generation:0,id:'10'}).allowed,false);
});
test('normalization handles corrupt state and keeps social dialogs outside Search',()=>{
 assert.deepEqual(C.normalize({version:99}),C.initialState());
 assert.equal(C.route('/person/followers/'),'other');assert.equal(C.route('/person/following/'),'other');
 assert.equal(C.route('/reel/A/'),'reels');assert.equal(C.route('/person/reel/A/'),'reels');assert.equal(C.route('/person/reels/'),'other');assert.equal(C.route('/explore/'),'explore');
});
