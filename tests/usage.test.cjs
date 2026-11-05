const {test}=require('node:test');
const assert=require('node:assert/strict');
const U=require('../extension/usage-core.js');
const id='0123456789abcdef';
test('daily counts deduplicate across tabs/reloads and keep sites separate',()=>{
 const now=new Date(2026,9,26,12).getTime();
 let s=U.record(null,{site:'instagram',ms:5000,items:[{kind:'posts',id},{kind:'reels',id}]},now);
 s=U.record(s,{site:'instagram',ms:5000,items:[{kind:'posts',id}]},now);
 s=U.record(s,{site:'youtube',ms:5000,items:[{kind:'videos',id}]},now);
 const d=s.days[U.dayKey(now)];assert.equal(d.instagramMs,10000);assert.equal(d.youtubeMs,5000);assert.equal(d.posts.length,1);assert.equal(d.reels.length,1);assert.equal(d.videos.length,1);
});
test('midnight splits time and starts fresh counts, preserving yesterday',()=>{
 const midnight=new Date(2026,9,27).getTime();
 let s=U.record(null,{site:'youtube',ms:5000,items:[{kind:'videos',id}]},midnight-1000);
 s=U.record(s,{site:'youtube',ms:5000,items:[{kind:'videos',id}]},midnight+2000);
 assert.equal(s.days[U.dayKey(midnight-1)].youtubeMs,8000);assert.equal(s.days[U.dayKey(midnight)].youtubeMs,2000);
 assert.equal(s.days[U.dayKey(midnight)].videos.length,1);
});
test('validates metrics, caps delayed reports and prunes old days',()=>{
 const now=Date.now();let s=U.record(null,{site:'youtube',ms:1e9,items:[{kind:'posts',id},{kind:'videos',id:'https://private'}]},now);
 const d=s.days[U.dayKey(now)];assert.equal(d.youtubeMs,10000);assert.equal(d.videos.length,0);assert.equal(d.posts.length,0);
 s.days['2000-01-01']=U.bucket();s=U.record(s,{site:'youtube',ms:-10},now);assert.equal(s.days['2000-01-01'],undefined);
});
test('LinkedIn extends existing daily metrics without erasing Instagram or YouTube',()=>{
 const now=Date.now(),key=U.dayKey(now);
 const old={version:1,startedAt:now,days:{[key]:{instagramMs:5000,youtubeMs:8000,reels:[id],posts:[id],videos:[id]}}};
 let s=U.record(old,{site:'linkedin',ms:5000,items:[{kind:'linkedinPosts',id}]},now);
 s=U.record(s,{site:'linkedin',ms:5000,items:[{kind:'linkedinPosts',id}]},now);
 assert.equal(s.days[key].linkedinMs,10000);assert.equal(s.days[key].linkedinPosts.length,1);
 assert.equal(s.days[key].instagramMs,5000);assert.equal(s.days[key].youtubeMs,8000);assert.deepEqual(s.days[key].posts,[id]);
});
