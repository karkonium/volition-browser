'use strict';
let state = StillCore.initialState();
let busy = false;
let instagramLoaded=false, instagramSync=false;
const notice = document.getElementById('notice');
let youtube = null;
let youtubeAccess = StillYouTubePolicy.initialState();
let youtubeAccessBusy = false;
let youtubeAccessSync = false;
let youtubeAccessLoaded = false;

function renderYouTube() {
  const now = Date.now();
  const remaining = Math.max(0,youtubeAccess.until-now);
  const waiting = Math.max(0,youtubeAccess.readyAt-now);
  const button = document.getElementById('youtube-recommendations');
  const label = !youtubeAccessLoaded?'Checking…':waiting?`Wait ${duration(waiting)}`:youtubeAccess.readyAt?'Finishing…':remaining?`Visible ${duration(remaining)}`:youtubeAccess.ready?'Show for 1m':'Start wait';
  renderWaitButton(button,youtubeAccess,label,!youtubeAccessLoaded || youtubeAccessBusy || !!youtubeAccess.readyAt || remaining>0);
  document.getElementById('youtube-access-status').textContent=waiting?'Hidden while you wait.':remaining?'Recommendations visible.':youtubeAccess.ready?'Ready when you are.':'Hidden by default.';
  const requests=youtubeAccess.day===StillYouTubePolicy.dayKey(now)?youtubeAccess.requests:0;
  document.getElementById('youtube-access-detail').textContent=waiting?'Ready stays available until you return.':remaining?'Hides automatically. Playback continues.':youtubeAccess.ready?'Click to start your one minute.':`Next wait: ${duration(StillYouTubePolicy.waitFor(requests))}. Resets at midnight.`;
  const names = {home:'Home',search:'Search results',shorts:'Shorts',watch:'Video recommendations',channel:'Channel feed',feed:'Subscriptions / feed'};
  document.getElementById('youtube-current').textContent = youtube ? `${names[youtube.surface]} · ${youtube.count} / ${youtube.limit}` : 'Open YouTube to begin.';
  document.getElementById('youtube-detail').textContent = youtube?.surface === 'watch' ? `Comments: ${youtube.secondary} / 10 · player stays available` : youtube?.surface === 'shorts' ? 'Shorts viewed in this batch' : 'Videos available in this batch';
  document.getElementById('youtube-reset').disabled = !youtube || busy;
}

async function syncYouTubeAccess(type = 'GET_YOUTUBE_ACCESS') {
  if (youtubeAccessSync) return;
  youtubeAccessSync = true;
  try {
    const result = await chrome.runtime.sendMessage({type});
    if (result?.error) throw new Error(result.error);
    if (result?.access) {youtubeAccess = StillYouTubePolicy.normalize(result.access);youtubeAccessLoaded=true;}
    renderYouTube();
  } finally { youtubeAccessSync = false; }
}
document.getElementById('youtube-recommendations').addEventListener('click', async () => {
  if (!youtubeAccessLoaded || youtubeAccessBusy || youtubeAccess.readyAt || youtubeAccess.until > Date.now()) return;
  const reveal=youtubeAccess.ready;
  youtubeAccessBusy = true; renderYouTube();
  try {
    await syncYouTubeAccess(reveal?'YOUTUBE_REVEAL':'YOUTUBE_RECOMMENDATIONS');
    notice.classList.remove('error');notice.textContent=reveal?'Recommendations visible for one minute.':'Wait started. Click Show for 1m when you return.';
  } catch (error) { notice.classList.add('error'); notice.textContent = error.message; }
  finally { youtubeAccessBusy = false; renderYouTube(); }
});
document.querySelectorAll('[data-site]').forEach(button => button.addEventListener('click', () => {
  for (const site of ['instagram','youtube','linkedin']) {
    document.getElementById(`${site}-panel`).hidden = site !== button.dataset.site;
    document.getElementById(`${site}-tab`).setAttribute('aria-pressed', String(site === button.dataset.site));
  }
  notice.textContent = '';
}));
document.getElementById('youtube-reset').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  renderYouTube();
  try {
    const result = await chrome.runtime.sendMessage({type:'YOUTUBE_RESET'});
    if (result?.error) throw new Error(result.error);
    notice.classList.remove('error');
    notice.textContent = 'A fresh batch in your last active YouTube tab.';
  } catch (error) {
    notice.classList.add('error');
    notice.textContent = error.message;
  } finally { busy = false; renderYouTube(); }
});

function duration(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;
}
function renderWaitButton(button,wait,label,disabled) {
  const waiting=Math.max(0,wait.readyAt-Date.now());
  button.disabled=disabled;
  for(const span of button.querySelectorAll('.button-label,.button-fill'))if(span.textContent!==label)span.textContent=label;
  button.setAttribute('aria-label',label);
  button.classList.toggle('is-waiting',!!wait.readyAt);
  const total=Math.max(1,wait.readyAt-wait.waitStartedAt);
  const progress=wait.readyAt?Math.max(0,Math.min(100,(1-waiting/total)*100)):100;
  button.style.setProperty('--wait-progress',`${progress}%`);
  button.setAttribute('aria-description',wait.readyAt?`${Math.round(progress)}% of wait complete`:wait.ready?'Ready. Click when you want to continue.':'');
}
function nextWait(wait,now) {return StillCore.waitFor(wait.windowStart && now-wait.windowStart<StillCore.DAY?wait.requests:0);}
function render() {
  const now=Date.now();
  for(const feature of StillCore.FEATURES){
    const wait=state.navigation[feature],remaining=Math.max(0,state.reveals[feature]-now),waiting=Math.max(0,wait.readyAt-now);
    document.getElementById(`${feature}-reveal`).textContent=remaining?`${duration(remaining)} visible`:waiting?'Waiting':wait.ready?'Ready':'Hidden';
    const label=!instagramLoaded?'Checking…':waiting?`Wait ${duration(waiting)}`:wait.readyAt?'Finishing…':remaining?`Visible ${duration(remaining)}`:wait.ready?(feature==='reels'?'Show Reels':'Show Search'):'Start wait';
    renderWaitButton(document.getElementById(feature==='reels'?'show-reels':'show-search'),wait,label,!instagramLoaded || busy || !!wait.readyAt || remaining>0);
    document.getElementById(`${feature}-detail`).textContent=waiting?'Ready stays available until you return.':remaining?'Only the navigation button expires.':wait.ready?'Click to reveal the button for 30s.':`Next wait: ${duration(nextWait(wait,now))} · 30s reveal.`;
  }
  const full=state.batches.reels.seen.length>=StillCore.LIMITS.reels,wait=state.more,waiting=Math.max(0,wait.readyAt-now);
  const label=!instagramLoaded?'Checking…':waiting?`Wait ${duration(waiting)}`:wait.readyAt?'Finishing…':wait.ready?'More Reels':full?'Start wait':'More Reels';
  renderWaitButton(document.getElementById('more-reels'),wait,label,!instagramLoaded || busy || !full || !!wait.readyAt);
  document.getElementById('reels-count').textContent=`${state.batches.reels.seen.length} / 10`;
  document.getElementById('more-detail').textContent=waiting?'Ready stays available until you return.':wait.ready?'Click when you want ten more.':full?`Next wait: ${duration(nextWait(wait,now))}.`:'Finish this batch for ten more.';
  document.getElementById('wait-status').textContent='Waits: 10s → 30s → 1m → double. Each resets after 24h.';
}

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error || 'Finite Scroll could not connect. Reopen the popup.');
  state = StillCore.normalize(result.state);instagramLoaded=true;
  render();
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-action]');
  if(!button || busy || !instagramLoaded || button.disabled)return;
  const {action,feature}=button.dataset;
  const ready=action==='show'?state.navigation[feature].ready:state.more.ready;
  const type=action==='show'?(ready?'SHOW':'WAIT_SHOW'):(ready?'CLAIM_REELS':'MORE_REELS');
  busy=true;render();notice.classList.remove('error');
  try{
    await send({type,feature});
    notice.textContent=ready?(action==='show'?'Instagram button visible for 30 seconds.':'Ten more Reels unlocked.'):'Wait started. Click the ready button when you return.';
  }catch(error){notice.classList.add('error');notice.textContent=error.message;}
  finally{busy=false;render();}
});
document.getElementById('about-toggle').addEventListener('click', event => {
  const about = document.getElementById('about');
  about.hidden = !about.hidden;
  event.target.setAttribute('aria-expanded', String(!about.hidden));
});
document.querySelector('.brand').addEventListener('click', event => event.preventDefault());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.youtubeStatus) {
    youtube = changes.youtubeStatus.newValue || null;
    renderYouTube();
  }
  if (area === 'local' && changes.youtubeAccess) {
    youtubeAccess = StillYouTubePolicy.normalize(changes.youtubeAccess.newValue);youtubeAccessLoaded=true;renderYouTube();
  }
  if (area === 'local' && changes.still) {
    state = StillCore.normalize(changes.still.newValue);instagramLoaded=true;
    render();
  }
});
send({ type: 'GET_STATE' }).catch(error => {
  notice.textContent = error.message;
  notice.classList.add('error');
});
setInterval(() => {
  render();
  renderYouTube();
  if (youtubeAccess.readyAt && Date.now() >= youtubeAccess.readyAt) syncYouTubeAccess().catch(()=>{});
  const waits=[state.more,...StillCore.FEATURES.map(key=>state.navigation[key])];
  if(!instagramSync && !busy && waits.some(wait=>wait.readyAt && Date.now()>=wait.readyAt)){
    instagramSync=true;send({type:'GET_STATE'}).catch(()=>{}).finally(()=>{instagramSync=false;});
  }
}, 250);
chrome.runtime.sendMessage({type:'GET_YOUTUBE'}).then(result => {
  youtube = result?.youtube || null;
  renderYouTube();
}).catch(() => renderYouTube());

syncYouTubeAccess().catch(()=>{});

let usage = FiniteUsage.initial(Date.now());
function renderUsage() {
  const today = usage.days[FiniteUsage.dayKey(Date.now())] || FiniteUsage.bucket();
  function time(ms) {
    const minutes = Math.floor(ms / 60000);
    return minutes >= 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : minutes ? `${minutes}m` : ms > 0 ? '<1m' : '0m';
  }
  document.getElementById('instagram-time').textContent=time(today.instagramMs);
  document.getElementById('youtube-time').textContent=time(today.youtubeMs);
  document.getElementById('linkedin-time').textContent=time(today.linkedinMs||0);
  for (const [id,kind] of [['instagram-reels','reels'],['instagram-posts','posts'],['youtube-videos','videos'],['linkedin-posts','linkedinPosts']]) document.getElementById(id).textContent=(today[kind]?.length||0).toLocaleString();
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if (area==='local' && changes.finiteUsage) {usage=changes.finiteUsage.newValue || FiniteUsage.initial(Date.now());renderUsage();}
});
chrome.runtime.sendMessage({type:'GET_USAGE'}).then(result=>{if(result?.usage) usage=result.usage;renderUsage();}).catch(()=>{});
setInterval(renderUsage,1000);

let loginBlocked=null, loginEffective=false, loginBusy=false, loginNeedsPermissions=false;
function renderLogin() {
  const button=document.getElementById('login-block');
  button.disabled=loginBusy || loginBlocked===null;
  button.textContent=loginBusy?'Updating…':loginBlocked?'Turn off':'Turn on';
  button.dataset.next=loginBlocked?'off':'on';
  button.setAttribute('aria-pressed',String(!!loginBlocked));
  document.getElementById('login-state').textContent=loginBlocked===null?'Checking…':loginBlocked?(loginEffective?'On':'Needs access'):'Off';
  document.getElementById('login-detail').textContent=loginNeedsPermissions?'Instagram cookie/site access needed.':loginBlocked?'Logs out and blocks until turned off.':'Log out and keep login blocked.';
}
function applyLogin(result) {
  if(!result || result.error)throw new Error(result?.error || 'Could not check Instagram login blocking.');
  loginBlocked=!!result.blocked;loginEffective=!!result.effective;loginNeedsPermissions=!!result.needsPermissions;renderLogin();
}
async function getLogin(){applyLogin(await chrome.runtime.sendMessage({type:'GET_LOGIN_BLOCK'}));}
document.getElementById('login-block').addEventListener('click',async()=>{
  if(loginBusy || loginBlocked===null)return;
  const enable=document.getElementById('login-block').dataset.next==='on';
  loginBusy=true;renderLogin();notice.classList.remove('error');
  try {
    const result=await chrome.runtime.sendMessage({type:'SET_LOGIN_BLOCK',blocked:enable});
    applyLogin(result);
    if(enable && !result.effective)throw new Error('Blocking needs Instagram cookie/site access.');
    notice.textContent=enable?'Blocking ON. Instagram signed out until you turn this off.':'Blocking OFF. You can sign in to Instagram again.';
  }catch(error){notice.classList.add('error');notice.textContent=error.message;await getLogin().catch(()=>{});}
  finally{loginBusy=false;renderLogin();}
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local' && changes.instagramLoginBlocked && !loginBusy)void getLogin().catch(()=>{});
});
renderLogin();getLogin().catch(error=>{notice.textContent=error.message;notice.classList.add('error');});

let linkedinAccess=FiniteLinkedInPolicy.initialState(),linkedinLoaded=false,linkedinBusy=false,linkedinSync=false;
function renderLinkedIn(){
  for(const feature of FiniteLinkedInPolicy.FEATURES){
    const batch=linkedinAccess[feature],remaining=Math.max(0,batch.until-Date.now());
    const button=document.getElementById(`linkedin-${feature}`);
    button.disabled=!linkedinLoaded || linkedinBusy;
    button.textContent=!linkedinLoaded?'Checking…':remaining?'Hide':'Show 5m';
    button.setAttribute('aria-pressed',String(remaining>0));
    document.getElementById(`linkedin-${feature}-state`).textContent=remaining?duration(remaining):'Hidden';
    document.getElementById(`linkedin-${feature}-detail`).textContent=remaining?`${batch.seen.length} / ${FiniteLinkedInPolicy.LIMITS[feature]} ${feature==='home'?'posts':'cards'} · hides automatically.`:feature==='home'?'Empty until unlocked · 10 posts.':'First 3 cards · My Network.';
  }
}
async function syncLinkedIn(message={type:'GET_LINKEDIN_ACCESS'}){
  const result=await chrome.runtime.sendMessage(message);if(result?.error)throw new Error(result.error);
  if(result?.access){linkedinAccess=FiniteLinkedInPolicy.normalize(result.access);linkedinLoaded=true;}renderLinkedIn();
}
for(const feature of FiniteLinkedInPolicy.FEATURES)document.getElementById(`linkedin-${feature}`).addEventListener('click',async()=>{
  if(linkedinBusy || !linkedinLoaded)return;
  const hide=linkedinAccess[feature].until>Date.now();linkedinBusy=true;renderLinkedIn();notice.classList.remove('error');
  try{await syncLinkedIn({type:hide?'LINKEDIN_HIDE':'LINKEDIN_UNLOCK',feature});notice.textContent=hide?'Hidden again.':feature==='home'?'Home unlocked: up to ten posts for five minutes.':'First three recommendations unlocked for five minutes.';}
  catch(error){notice.classList.add('error');notice.textContent=error.message;}
  finally{linkedinBusy=false;renderLinkedIn();}
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local' && changes.linkedinAccess){linkedinAccess=FiniteLinkedInPolicy.normalize(changes.linkedinAccess.newValue);linkedinLoaded=true;renderLinkedIn();}
});
syncLinkedIn().catch(error=>{notice.textContent=error.message;notice.classList.add('error');});
setInterval(()=>{
  renderLinkedIn();
  if(!linkedinSync && FiniteLinkedInPolicy.FEATURES.some(key=>linkedinAccess[key].until && Date.now()>=linkedinAccess[key].until)){
    linkedinSync=true;syncLinkedIn().catch(()=>{}).finally(()=>{linkedinSync=false;});
  }
},250);

document.getElementById('build-version').textContent='v'+chrome.runtime.getManifest().version;
