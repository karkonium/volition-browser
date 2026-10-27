const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const extension=path.resolve(__dirname,'../extension');
fs.mkdirSync(path.resolve(__dirname,'../preview'),{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'finite-scroll-usage-'));
const video=`<video muted autoplay playsinline style="display:block;width:600px;height:400px"></video><script>
const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;
const ctx=canvas.getContext('2d');setInterval(()=>{ctx.fillStyle='#234';ctx.fillRect(0,0,600,400)},100);
const video=document.querySelector('video');video.srcObject=canvas.captureStream(10);video.play();</script>`;
(async()=>{
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1000,height:760}});
 const errors=[];context.on('weberror',e=>errors.push(e.error().message));
 try {
  await context.route('https://www.youtube.com/**',r=>r.fulfill({contentType:'text/html',body:`<html><body><ytd-watch-flexy><div id="movie_player">${video}</div></ytd-watch-flexy></body></html>`}));
  await context.route('https://www.instagram.com/**',r=>{
   const reels=new URL(r.request().url()).pathname.includes('/reel/');
   return r.fulfill({contentType:'text/html',body:reels?`<html><body><div role="dialog"><article><a href="/alice/reel/REEL1/">Reel</a>${video}</article></div></body></html>`:`<html><body style="margin:0">${Array.from({length:25},(_,i)=>`<article style="height:600px"><a href="/p/POST${i}/">Post</a><img width="600" height="500" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='500'%3E%3Crect width='600' height='500' fill='%23dde5da'/%3E%3C/svg%3E"></article>`).join('')}</body></html>`});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const key=new URL(worker.url()).host;
  const stats=()=>worker.evaluate(async()=>{const {finiteUsage}=await chrome.storage.local.get('finiteUsage');return finiteUsage?.days[FiniteUsage.dayKey(Date.now())]||FiniteUsage.bucket()});
  async function until(predicate,label){const end=Date.now()+14000;while(Date.now()<end){if(predicate(await stats()))return;await new Promise(r=>setTimeout(r,200));}throw new Error(`Timed out: ${label}: ${JSON.stringify(await stats())}`)}
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=VIDEO1');await page.bringToFront();
  await until(d=>d.videos.length===1 && d.youtubeMs>=4000,'visible playing video');
  console.log('PASS: visible YouTube playback counts a video and active time');
  await page.evaluate(()=>document.querySelector('video').pause());await page.reload();
  await page.bringToFront();await page.waitForTimeout(6500);assert.equal((await stats()).videos.length,1);
  console.log('PASS: reopening the same video preserves daily deduplication');
  await page.goto('https://www.youtube.com/watch?v=PAUSED');await page.evaluate(()=>document.querySelector('video').pause());
  await page.waitForTimeout(6000);assert.equal((await stats()).videos.length,1);
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await page.evaluate(()=>document.querySelector('video').play());await page.waitForTimeout(6500);assert.equal((await stats()).videos.length,1);
  const before=(await stats()).youtubeMs;await page.waitForTimeout(5500);assert.equal((await stats()).youtubeMs,before);
  console.log('PASS: paused videos and background playback do not add watches; hidden tabs add no time');
  await page.goto('https://www.instagram.com/');await page.bringToFront();
  await until(d=>d.posts.length===1,'first actual post');await page.waitForTimeout(2200);assert.equal((await stats()).posts.length,1);
  await page.evaluate(()=>scrollTo(0,600));await until(d=>d.posts.length===2,'second visible post');
  console.log('PASS: Instagram counts viewed posts, not the ten admitted off-screen cards');
  await page.goto('https://www.instagram.com/alice/reel/REEL1/');await page.bringToFront();
  await until(d=>d.reels.length===1,'profile Reel');assert.equal((await stats()).posts.length,2);
  console.log('PASS: a profile Reel counts separately from photo posts');
  const popup=await context.newPage();await popup.setViewportSize({width:408,height:800});await popup.goto(`chrome-extension://${key}/popup.html`);
  await popup.waitForFunction(()=>document.querySelector('#instagram-posts').textContent==='2');
  assert.equal(await popup.locator('#youtube-videos').textContent(),'1');assert.equal(await popup.locator('#instagram-reels').textContent(),'1');
  assert.equal(await popup.locator('h1').count(),0);assert.equal(await popup.title(),'Finite Scroll');
  assert.ok(await popup.evaluate(()=>document.body.scrollHeight<=600),'Instagram popup fits 600px');
  await popup.screenshot({path:path.resolve(__dirname,'../preview/dashboard-instagram.png'),fullPage:true});
  await popup.locator('#youtube-tab').click();
  assert.equal(await popup.locator('#youtube-recommendations').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(43, 96, 75)');
  assert.ok(await popup.evaluate(()=>document.body.scrollHeight<=600),'YouTube popup fits 600px');
  await popup.screenshot({path:path.resolve(__dirname,'../preview/dashboard-youtube.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: compact dashboard displays persisted totals; YouTube actions use Instagram green; no page errors');
 } finally {await context.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
