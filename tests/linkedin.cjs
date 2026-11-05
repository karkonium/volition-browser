const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const extension=path.resolve(__dirname,'../extension'),preview=path.resolve(__dirname,'../preview');fs.mkdirSync(preview,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'finite-linkedin-'));
const tail='<button class="scaffold-finite-scroll__load-button" id="tail" style="height:800px">Load more</button>';
function posts(modern=false){return Array.from({length:25},(_,i)=>modern?`<section data-test-post="${i}" componentkey="expandedurn:li:activity:${1000+i}" style="height:220px;border:1px solid #ccc"><div data-view-name="feed-full-update"><div class="feed-shared-update-v2"><a href="/feed/update/urn:li:activity:${1000+i}/">Post ${i}</a><button onclick="window.comments=(window.comments||0)+1">Comment</button></div></div></section>`:`<div data-test-post="${i}" class="occludable-update" data-id="urn:li:activity:${1000+i}" style="height:220px;border:1px solid #ccc"><div class="feed-shared-update-v2" data-urn="urn:li:activity:${1000+i}"><a href="/feed/update/urn:li:activity:${1000+i}/">Post ${i}</a><button onclick="window.comments=(window.comments||0)+1">Comment</button></div></div>`).join('');}
function people(start,count,modern=false){return Array.from({length:count},(_,i)=>`<li data-test-person="${start+i}" ${modern?'':'class="discover-entity-type-card"'} style="height:150px;list-style:none"><a href="/in/person-${start+i}/">Person ${start+i}</a><a href="/in/person-${start+i}/">Avatar</a><button onclick="this.dataset.clicked='true'">Connect</button></li>`).join('');}
function fixture(url){
 const nav='<nav><a href="/feed/">Home</a><a href="/mynetwork/grow/">My Network</a><a href="/jobs/">Jobs</a><a href="/messaging/">Messages</a></nav>';
 const style='<style>body{margin:0}main{width:600px}nav{height:35px}article,section{display:block}ul{margin:0;padding:0}</style>';
 if(url.pathname.startsWith('/mynetwork') && !url.pathname.includes('invite-connect'))return `${style}${nav}<aside><a href="/in/me/">My profile</a></aside><main><div><a href="/in/inviter/">Invitation</a><button id="accept" aria-label="Accept invitation" onclick="this.dataset.clicked='true'">Accept</button><button aria-label="Ignore invitation">Ignore</button></div><div data-view-name="cohorts-see-all-list"><ul id="people"></ul></div>${tail}</main><script>setTimeout(()=>document.querySelector('#people').innerHTML=${JSON.stringify(people(0,8,url.searchParams.has('modern')))},350)</script>`;
 if(/^\/feed\/(?:foryou|following|network)\/?$/.test(url.pathname)){
  const cards=Array.from({length:25},(_,i)=>`<div data-lazy-mount-id="slot-${i}" style="display:contents"><div data-test-post="${i}" componentkey="expandedopaque_${i}FeedType_MAIN_FEED_RELEVANCE" style="height:220px"><div role="listitem" componentkey="update-card-focusopaque_${i}FeedType_MAIN_FEED_RELEVANCE"><h2>Feed post</h2><p componentkey="text-${i}">Post ${i}</p><button>Comment</button></div></div></div>`).join('');
  return `${style}${nav}<main id="workspace" style="height:650px;overflow:auto"><aside id="sidebar">Profile</aside><section aria-label="Primary content"><div data-sdui-screen="com.linkedin.sdui.flagshipnav.feed.ForYouFeed"><div role="list" data-testid="mainFeed" componentkey="container-update-list_mainFeed-lazy-container">${cards}<div id="spacer" style="height:100000px"></div>${tail}</div></div></section><aside>News</aside></main>`;
 }
 if((url.pathname.startsWith('/feed') && !url.pathname.startsWith('/feed/update/')) || url.pathname==='/')return `${style}${nav}<main>${posts(url.searchParams.has('modern'))}${tail}</main><footer>LinkedIn footer</footer>`;
 return `${style}${nav}<main><input placeholder="Search connections"><div class="discover-entity-type-card"><a href="/in/friend/">Friend</a></div>${posts()}${tail}</main>`;
}
(async()=>{
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1100,height:760}});
 let checks=0;const pass=text=>{checks++;console.log('PASS: '+text)};const errors=[];context.on('weberror',e=>errors.push(e.error().message));
 try{
  await context.route('https://www.linkedin.com/**',r=>r.fulfill({contentType:'text/html',body:fixture(new URL(r.request().url()))}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const page=await context.newPage(),popup=await context.newPage();
  await popup.setViewportSize({width:408,height:600});await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  const policies=await worker.evaluate(async()=>{const s=await chrome.storage.local.get(['still','youtubeAccess']);return JSON.stringify(s)});
  const visiblePosts=()=>page.locator('[data-test-post]:visible').count();
  const visiblePeople=()=>page.locator('#people [data-test-person]:visible').count();
  const unlock=async feature=>{await popup.evaluate(feature=>chrome.runtime.sendMessage({type:'LINKEDIN_UNLOCK',feature}),feature);};
  const expire=async feature=>worker.evaluate(async feature=>{const {linkedinAccess:s}=await chrome.storage.local.get('linkedinAccess');s[feature].until=Date.now()-1;await chrome.storage.local.set({linkedinAccess:s});},feature);
  await page.goto('https://www.linkedin.com/feed/foryou/');await page.waitForTimeout(500);
  assert.equal(await visiblePosts(),0);assert.equal(await page.locator('#sidebar').isVisible(),true);
  pass('live For You route starts hidden without hiding its surrounding workspace');
  await unlock('home');await page.waitForTimeout(800);assert.equal(await visiblePosts(),10);assert.equal(await page.locator('#spacer').isVisible(),false);
  assert.ok(await page.locator('#workspace').evaluate(e=>e.scrollHeight<3500));
  pass('SDUI opaque card identities and lazy wrappers retain ten posts without a giant virtual scroll spacer');
  for(const route of ['/feed/following/','/feed/network/']){await page.goto('https://www.linkedin.com'+route);await page.waitForTimeout(600);assert.equal(await visiblePosts(),10);}
  await page.evaluate(()=>history.pushState({},'', '/feed/update/urn:li:activity:123/'));await page.waitForTimeout(600);assert.equal(await visiblePosts(),25);
  await page.evaluate(()=>history.pushState({},'', '/feed/foryou/'));await page.waitForTimeout(600);assert.equal(await visiblePosts(),10);
  pass('Home variants share their allowance across native route switches while individual post routes stay native');
  await expire('home');await page.waitForTimeout(100);assert.equal(await visiblePosts(),0);
  await page.goto('https://www.linkedin.com/feed/');await page.waitForTimeout(500);
  assert.equal(await visiblePosts(),0);assert.equal(await page.locator('nav').isVisible(),true);
  pass('Home is empty by default while native navigation stays usable');
  await unlock('home');await page.waitForFunction(()=>document.querySelectorAll('[data-test-post][data-finite-linkedin-allowed]').length===10);
  assert.equal(await visiblePosts(),10);assert.equal(await page.locator('#tail').isVisible(),false);
  assert.equal(await page.locator('[data-finite-ui],[data-still-ui],[role="dialog"]').count(),0);
  await page.locator('[data-test-post="0"] button').click();assert.equal(await page.evaluate(()=>window.comments),1);
  pass('explicit Home unlock shows ten posts with native post controls and no takeover UI');
  await page.bringToFront();
  const stable=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();let ok=true;function frame(){const count=[...document.querySelectorAll('[data-test-post]')].filter(e=>e.getClientRects().length).length;if(count!==10)ok=false;if(performance.now()-start>2200)resolve(ok);else requestAnimationFrame(frame);}frame();}));assert.equal(stable,true);
  const daily=await worker.evaluate(async()=>{const {finiteUsage}=await chrome.storage.local.get('finiteUsage');return finiteUsage?.days[FiniteUsage.dayKey(Date.now())]});assert.ok(daily.linkedinPosts.length>0 && daily.linkedinPosts.length<10);
  pass('periodic scans do not flicker admitted cards and metrics count viewed posts rather than the whole grant');

  await page.evaluate(()=>{const node=document.createElement('article');node.id='unknown';node.style.height='500px';node.textContent='Unknown new renderer';document.querySelector('main').append(node);const late=document.createElement('div');late.id='late';late.className='feed-shared-update-v2';late.dataset.urn='urn:li:activity:999999';late.textContent='Late known post';document.querySelector('main').append(late)});
  await page.waitForTimeout(600);assert.equal(await page.locator('#unknown').isVisible(),false);assert.equal(await page.locator('#late').isVisible(),false);assert.equal(await visiblePosts(),10);
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));assert.ok(await page.evaluate(()=>scrollY>0));assert.equal(page.url(),'https://www.linkedin.com/feed/');
  pass('known and unknown late renderers remain hidden; ordinary scrolling ends naturally');
  await page.reload();await page.waitForTimeout(600);assert.equal(await visiblePosts(),10);
  await page.goto('https://www.linkedin.com/feed/?modern=1');await page.waitForTimeout(600);assert.equal(await visiblePosts(),10);
  await page.evaluate(()=>{const first=document.querySelector('[data-test-post="0"]');first.setAttribute('componentkey','expandedurn:li:activity:777777');first.innerHTML='<a href="/feed/update/urn:li:activity:777777/">Different post</a>';});
  await page.waitForTimeout(600);assert.equal(await visiblePosts(),9);
  pass('refresh, modern markup, and virtualized card identity changes cannot expand the shared ten-post grant');
  const other=await context.newPage();await other.goto('https://www.linkedin.com/feed/');await other.evaluate(()=>{document.querySelector('main').innerHTML='<div class="feed-shared-update-v2" data-urn="urn:li:activity:555555">New tab post</div>';});await other.waitForTimeout(600);assert.equal(await other.locator('.feed-shared-update-v2').isVisible(),false);await other.close();
  pass('another tab cannot acquire a fresh ten posts during the same unlock');
  await expire('home');await page.waitForTimeout(600);assert.equal(await visiblePosts(),0);
  await unlock('home');await page.waitForTimeout(600);assert.equal(await visiblePosts(),10);
  await popup.evaluate(()=>chrome.runtime.sendMessage({type:'LINKEDIN_HIDE',feature:'home'}));await page.waitForTimeout(150);assert.equal(await visiblePosts(),0);
  pass('expiry and manual Hide make Home empty; a new explicit unlock starts a fresh batch');
  await page.goto('https://www.linkedin.com/mynetwork/grow/');await page.waitForTimeout(650);
  assert.equal(await visiblePeople(),0);assert.equal(await page.locator('#accept').isVisible(),true);await page.locator('#accept').click();assert.equal(await page.locator('#accept').getAttribute('data-clicked'),'true');
  pass('Network recommendations default hidden while invitations remain usable');
  await unlock('network');await page.waitForTimeout(600);assert.equal(await visiblePeople(),3);await page.locator('#people [data-test-person]:visible button').first().click();
  await page.evaluate(html=>document.querySelector('#people').insertAdjacentHTML('beforeend',html),people(8,20));await page.waitForTimeout(600);assert.equal(await visiblePeople(),3);assert.equal(await page.locator('#tail').isVisible(),false);
  pass('Network reveals exactly three people and its native Connect control, with no later cards or loader');
  await page.evaluate(html=>{const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.innerHTML='<button aria-label="Close">Close</button><div data-view-name="cohorts-see-all-list"><ul id="dialog-people">'+html+'</ul></div>';document.body.append(modal)},people(100,12,true));
  await page.waitForTimeout(600);assert.equal(await page.locator('#dialog-people [data-test-person]:visible').count(),0);assert.equal(await page.locator('button[aria-label="Close"]').isVisible(),true);
  await page.reload();await page.waitForTimeout(650);assert.equal(await visiblePeople(),3);
  await page.goto('https://www.linkedin.com/mynetwork/grow/?modern=1');await page.waitForTimeout(650);assert.equal(await visiblePeople(),3);
  pass('dialogs, reloads and modern classless cards share the same three-card grant');
  await expire('network');await page.waitForTimeout(600);assert.equal(await visiblePeople(),0);assert.equal(await page.locator('#accept').isVisible(),true);
  pass('Network hides the card when its five-minute grant expires');
  for(const url of ['/in/friend/','/messaging/','/mynetwork/invite-connect/connections/']){await page.goto('https://www.linkedin.com'+url);await page.waitForTimeout(200);assert.equal(await visiblePosts(),25);await page.locator('input').fill('friend');}
  pass('profiles, messages and the connections directory remain native');
  await popup.bringToFront();await popup.locator('#linkedin-tab').click();
  for(const selector of ['#linkedin-home','#linkedin-network']){const size=await popup.locator(selector).evaluate(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height,getComputedStyle(e).backgroundColor]);assert.deepEqual(size,[112,36,'rgb(43, 96, 75)']);}
  assert.ok(await popup.evaluate(()=>document.body.scrollHeight<=600));await popup.screenshot({path:path.join(preview,'linkedin-popup.png'),fullPage:true});
  await popup.locator('#linkedin-home').click();await popup.waitForFunction(()=>document.querySelector('#linkedin-home').textContent==='Hide');await popup.locator('#linkedin-home').click();await popup.waitForFunction(()=>document.querySelector('#linkedin-home').textContent==='Show 5m');
  pass('both green popup buttons share the existing size and support explicit unlock and Hide');
  assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(['still','youtubeAccess']))),policies);assert.deepEqual(errors,[]);
  pass('LinkedIn leaves IG/YouTube access untouched and produces no page errors');
  console.log(`\n${checks} LinkedIn browser checks passed.`);
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
