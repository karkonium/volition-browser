const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../extension/youtube-policy.js');
const now=new Date(2026,9,25,12,0,0).getTime();
test('recommendations start hidden; waits remain 10s, 30s, 1m then double',()=>{
 assert.equal(P.initialState(now).until,0);assert.equal(P.initialState(now).ready,false);
 assert.deepEqual([0,1,2,3,4].map(P.waitFor),[10000,30000,60000,120000,240000]);
});
test('finished wait stays ready without revealing; explicit click starts exactly one minute',()=>{
 let s=P.reduce(null,{type:'REQUEST'},now).state;assert.equal(s.readyAt,now+10000);assert.equal(s.waitStartedAt,now);
 assert.deepEqual(P.reduce(s,{type:'REQUEST'},now+5000).state,s);
 assert.equal(P.reduce(s,{type:'REVEAL'},now+5000).state.until,0);
 s=P.reduce(s,{},now+10000).state;assert.equal(s.ready,true);assert.equal(s.until,0);assert.equal(s.readyAt,0);
 assert.deepEqual(P.reduce(s,{type:'REQUEST'},now+20000).state,s);
 s=P.reduce(s,{type:'REVEAL'},now+3600000).state;assert.equal(s.until,now+3660000);assert.equal(s.ready,false);
 assert.equal(P.reduce(s,{type:'REVEAL'},now+3620000).state.until,now+3660000);
 assert.equal(P.reduce(s,{type:'REQUEST'},now+3620000).state.until,now+3660000);
 s=P.reduce(s,{type:'REQUEST'},now+3660000).state;assert.equal(s.readyAt,now+3690000);
});
test('ready credit survives closed popup, restart and local midnight until consumed',()=>{
 let s=P.reduce(null,{type:'REQUEST'},now).state;
 s=P.reduce(JSON.parse(JSON.stringify(s)),{},now+2*P.DAY).state;
 assert.equal(s.until,0);assert.equal(s.readyAt,0);assert.equal(s.ready,true);assert.equal(s.requests,0);
 s=P.reduce(s,{type:'REVEAL'},now+2*P.DAY+5000).state;assert.equal(s.until,now+2*P.DAY+65000);
 s=P.reduce(s,{},now+2*P.DAY+100000).state;assert.equal(s.until,0);assert.equal(s.ready,false);
});
test('midnight resets escalation without changing the progress origin or pending deadline',()=>{
 const late=new Date(2026,9,25,23,59,55).getTime(),midnight=new Date(2026,9,26).getTime();
 let s=P.reduce(null,{type:'REQUEST'},late).state;
 s=P.reduce(s,{},midnight).state;assert.equal(s.requests,0);assert.equal(s.readyAt,late+10000);assert.equal(s.waitStartedAt,late);
 s=P.reduce(s,{type:'REVEAL'},late+71000).state;assert.equal(s.until,late+131000);
 s=P.reduce(s,{type:'REQUEST'},late+131000).state;assert.equal(s.readyAt,late+141000);
});
test('v1 pending waits migrate to ready; active reveals keep their original deadline',()=>{
 const pending={version:1,day:P.dayKey(now),requests:1,readyAt:now+10000,until:0};
 let s=P.reduce(pending,{},now+3600000).state;assert.equal(s.ready,true);assert.equal(s.until,0);
 s=P.reduce({...pending,readyAt:0,until:now+30000},{},now).state;assert.equal(s.until,now+30000);assert.equal(s.ready,false);
 s=P.reduce({...pending,readyAt:0,until:now-1},{},now).state;assert.equal(s.ready,false);assert.equal(s.until,0);
});
test('invalid saved access returns safe hidden defaults',()=>{
 assert.equal(P.normalize({version:7},now).until,0);
 const s=P.normalize({version:2,until:NaN,readyAt:Infinity,requests:-8,ready:'yes'},now);assert.equal(s.until,0);assert.equal(s.readyAt,0);assert.equal(s.requests,0);assert.equal(s.ready,false);
});
