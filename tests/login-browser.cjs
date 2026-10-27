const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https');
const {execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finite-login-test-'));
const extension=path.resolve(__dirname,'../extension');
fs.mkdirSync(path.resolve(__dirname,'../preview'),{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1','-subj','/CN=www.instagram.com'],{stdio:'ignore'});
const server=https.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),cert:fs.readFileSync(path.join(dir,'cert.pem'))},(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/set-login') {res.setHeader('Set-Cookie','sessionid=fixture-login; Path=/; Secure; HttpOnly; SameSite=Lax');res.end('attempted');return;}
 if(req.url==='/session') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({loggedIn:!!req.headers.cookie?.includes('sessionid=')}));return;}
 if(req.url.includes('/accounts/login/ajax')){res.end('login-endpoint-reached');return;}
 res.setHeader('Content-Type','text/html');res.end('<html><body><main>Instagram fixture</main><form action="/accounts/login/ajax/" method="post"><input name="username"><input type="password"><button id="login-submit" type="submit">Log in</button></form></body></html>');
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`https://www.instagram.com:${server.address().port}`;
 const launch=()=>chromium.launchPersistentContext(path.join(dir,'profile'),{channel:'chromium',headless:true,ignoreHTTPSErrors:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server','--host-resolver-rules=MAP www.instagram.com 127.0.0.1','--ignore-certificate-errors']});
 let context=await launch();let page,popup,worker;
 const errors=[];
 async function setup(){
  context.on('weberror',e=>errors.push(e.error().message));
  worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  page=await context.newPage();await page.goto(base);
  popup=await context.newPage();await popup.setViewportSize({width:408,height:600});await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await popup.waitForFunction(()=>!document.querySelector('#login-block').disabled);
 }
 const igCookies=()=>worker.evaluate(()=>chrome.cookies.getAll({domain:'instagram.com',partitionKey:{}}));
 async function poll(predicate){const until=Date.now()+8000;while(Date.now()<until){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Condition did not settle');}
 try {
  await setup();
  await page.evaluate(async()=>fetch('/set-login',{credentials:'include'}));
  assert.equal(await page.evaluate(async()=>(await(await fetch('/session')).json()).loggedIn),true);
  await context.addCookies([{url:'https://accounts.google.com',name:'SID',value:'google-fixture',secure:true,httpOnly:true,expires:Math.floor(Date.now()/1000)+86400}]);
  await worker.evaluate(()=>chrome.cookies.set({url:'https://www.instagram.com/',name:'partitioned',value:'partition-fixture',secure:true,partitionKey:{topLevelSite:'https://instagram.com'}}));
  assert.ok((await igCookies()).length>=2);
  await popup.locator('#login-block').click();await popup.waitForFunction(()=>document.querySelector('#login-block').textContent==='Turn off');
  await page.waitForURL('**/accounts/login/');
  assert.equal((await igCookies()).length,0);
  assert.equal((await context.cookies('https://accounts.google.com')).find(c=>c.name==='SID')?.value,'google-fixture');
  assert.equal(await page.evaluate(async()=>(await(await fetch('/session')).json()).loggedIn),false);
  console.log('PASS: toggle clears Instagram HttpOnly and partitioned cookies, signs out open tabs, and preserves Google login');
  await page.evaluate(async()=>fetch('/set-login',{credentials:'include'}));
  assert.equal(await page.evaluate(async()=>(await(await fetch('/session')).json()).loggedIn),false);
  assert.equal((await igCookies()).length,0);
  await worker.evaluate(()=>chrome.cookies.set({url:'https://www.instagram.com/',name:'sessionid',value:'script-fixture',secure:true}));
  await poll(async()=>(await igCookies()).length===0);
  await page.waitForFunction(()=>document.querySelector('#login-submit').disabled);
  const loginRequest=await page.evaluate(async()=>{try{await fetch('/api/v1/web/accounts/login/ajax/',{method:'POST'});return 'sent';}catch{return 'blocked';}});
  assert.equal(loginRequest,'blocked');
  const endpoint='https://www.instagram.com/api/v1/web/accounts/login/ajax/';
  const failedRequest=popup.waitForEvent('requestfailed',{predicate:request=>request.url()===endpoint});
  await popup.evaluate(async url=>{try{await fetch(url,{method:'POST'});}catch{}},endpoint);
  assert.match((await failedRequest).failure().errorText,/ERR_BLOCKED_BY_CLIENT/);
  const beforeSubmit=page.url();await page.evaluate(()=>document.querySelector('form').requestSubmit());assert.equal(page.url(),beforeSubmit);

  console.log('PASS: native login controls are disabled and Instagram login POST requests are blocked');
  console.log('PASS: real HTTPS login responses cannot save a session and newly created cookies are removed');
  const untrusted=await context.newPage();await untrusted.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html?untrusted`);
  const denied=await untrusted.evaluate(()=>chrome.runtime.sendMessage({type:'SET_LOGIN_BLOCK',blocked:false}));assert.ok(denied.error);await untrusted.close();
  assert.equal(await popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'GET_LOGIN_BLOCK'})).effective),true);
  assert.equal(await popup.locator('#login-state').textContent(),'On');
  console.log('PASS: only the extension popup can change the login block');
  await popup.mouse.move(0,0);
  const buttonSize=await popup.locator('.unlock').evaluateAll(nodes=>nodes.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,bg:getComputedStyle(e).backgroundColor})).filter(s=>s.w));
  assert.ok(buttonSize.every(s=>s.w===112&&s.h===36&&s.bg==='rgb(43, 96, 75)'));
  await popup.screenshot({path:path.resolve(__dirname,'../preview/login-block.png'),fullPage:true});
  const height=await popup.evaluate(()=>document.body.scrollHeight);assert.ok(height<=600,`Instagram popup fits 600px (actual ${height})`);
  await popup.screenshot({path:path.resolve(__dirname,'../preview/login-block.png'),fullPage:true});
  await popup.locator('#youtube-tab').click();
  const yt=await popup.locator('#youtube-panel .unlock').evaluateAll(nodes=>nodes.map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height]));
  assert.deepEqual(yt,[[112,36],[112,36]]);
  await popup.screenshot({path:path.resolve(__dirname,'../preview/youtube-controls.png'),fullPage:true});
  console.log('PASS: every action uses the same 112 × 36 green button and shared control row');
  await context.close();context=await launch();await setup();
  assert.equal(await popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'GET_LOGIN_BLOCK'})).effective),true);
  assert.equal(await popup.locator('#login-state').textContent(),'On');
  await page.evaluate(async()=>fetch('/set-login',{credentials:'include'}));
  assert.equal(await page.evaluate(async()=>(await(await fetch('/session')).json()).loggedIn),false);
  console.log('PASS: login block remains enabled after a full browser restart');
  // Simulate a lost browser rule: stored intent must repair it without turning blocking off.
  await worker.evaluate(()=>chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[91001,91002]}));
  const repaired=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'GET_LOGIN_BLOCK'}));assert.equal(repaired.blocked,true);assert.equal(repaired.effective,true);
  console.log('PASS: stored ON state repairs missing network rules and stays ON when reopening the popup');
  await popup.locator('#login-block').click();await popup.waitForFunction(()=>document.querySelector('#login-block').textContent==='Turn on');
  await page.waitForLoadState('load');
  assert.equal(await page.evaluate(async()=>(await(await fetch('/session')).json()).loggedIn),false);
  await page.evaluate(async()=>fetch('/set-login',{credentials:'include'}));
  assert.equal(await page.evaluate(async()=>(await(await fetch('/session')).json()).loggedIn),true);
  assert.equal((await context.cookies('https://accounts.google.com')).find(c=>c.name==='SID')?.value,'google-fixture');
  assert.deepEqual(errors,[]);console.log('PASS: allowing login restores normal sessions without recovering the deleted login; no page errors');
 }finally{await context.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
