importScripts('core.js', 'youtube-policy.js', 'usage-core.js', 'login-guard.js','linkedin-policy.js');
const { normalize, reduce, FEATURES } = StillCore;
let queue = Promise.resolve();

async function youtubeAccess(message = {}) {
  const { youtubeAccess: raw } = await chrome.storage.local.get('youtubeAccess');
  const result = StillYouTubePolicy.reduce(raw, message);
  if (JSON.stringify(raw) !== JSON.stringify(result.state)) await chrome.storage.local.set({ youtubeAccess: result.state });
  return result.state;
}
async function linkedinAccess(message={}){
  const {linkedinAccess:raw}=await chrome.storage.local.get('linkedinAccess');
  const result=FiniteLinkedInPolicy.reduce(raw,message);
  if(JSON.stringify(raw)!==JSON.stringify(result.state))await chrome.storage.local.set({linkedinAccess:result.state});
  return result;
}
async function updateBadge(state) {
  const now = Date.now();
  const access = await youtubeAccess();
  const {state:linkedin}=await linkedinAccess();
  const active = FEATURES.filter(key => state.reveals[key] > now).length + (access.until > now ? 1 : 0);
  const waits=[state.more,...FEATURES.map(key=>state.navigation[key])];
  await chrome.action.setBadgeBackgroundColor({ color: '#245e4c' });
  await chrome.action.setBadgeText({ text: waits.some(wait=>wait.readyAt>now) || access.readyAt>now ? '…' : access.ready || waits.some(wait=>wait.ready) ? 'Ready' : active ? String(active) : '' });
  const next = Math.min(...[...FEATURES.map(key => state.reveals[key]), ...waits.map(wait=>wait.readyAt), access.readyAt, access.until,...FiniteLinkedInPolicy.FEATURES.map(key=>linkedin[key].until)].filter(time => time > now));
  if (Number.isFinite(next)) await chrome.alarms.create('still-expiry', { when: next });
  else await chrome.alarms.clear('still-expiry');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Instagram content scripts may record usage; only extension pages can grant time.
  const privileged = ['LINKEDIN_UNLOCK','LINKEDIN_HIDE','GET_LINKEDIN','LINKEDIN_RESET','SET_LOGIN_BLOCK','YOUTUBE_RECOMMENDATIONS', 'YOUTUBE_REVEAL', 'WAIT_SHOW', 'CLAIM_REELS', 'SHOW', 'MORE_REELS', 'UNLOCK', 'LOCK', 'LOCK_ALL', 'RESET_BATCH', 'GET_YOUTUBE', 'YOUTUBE_RESET'];
  const popupSender = sender.url === chrome.runtime.getURL('popup.html');
  if (privileged.includes(message?.type) && !popupSender) {
    respond({ error: 'Open the Finite Scroll popup to change access.' });
    return false;
  }
  queue = queue.catch(() => {}).then(async () => {
    if (message?.type === 'GET_LOGIN_BLOCK' || message?.type === 'SET_LOGIN_BLOCK') {
      if (message.type === 'SET_LOGIN_BLOCK' && typeof message.blocked !== 'boolean') throw new Error('Choose whether to block login.');
      if(message.type==='GET_LOGIN_BLOCK' && !popupSender && !/^https:\/\/(?:[^/]+\.)?instagram\.com(?::[0-9]+)?\//.test(sender.url||'')) throw new Error('Instagram tab or extension popup required.');
      const status=message.type==='SET_LOGIN_BLOCK'?await InstagramLoginGuard.set(message.blocked):await InstagramLoginGuard.status();
      respond(status);
      return;
    }
    if (message?.type === 'GET_USAGE') {
      if (!popupSender) throw new Error('Extension popup required.');
      const { finiteUsage } = await chrome.storage.local.get('finiteUsage');
      respond({usage:finiteUsage || FiniteUsage.initial(Date.now())});
      return;
    }
    if (message?.type === 'RECORD_USAGE') {
      const host = new URL(sender.url).hostname;
      const site = ['instagram.com','www.instagram.com'].includes(host) ? 'instagram' : ['youtube.com','www.youtube.com'].includes(host)?'youtube':['linkedin.com','www.linkedin.com'].includes(host)?'linkedin':null;
      if (!site || site !== message.site || !Number.isInteger(sender.tab?.id)) throw new Error('Site tab required.');
      const tab = await chrome.tabs.get(sender.tab.id);
      const window = await chrome.windows.get(tab.windowId);
      if (!tab.active || !window.focused) { respond({ok:true,accepted:false}); return; }
      const { finiteUsage } = await chrome.storage.local.get('finiteUsage');
      await chrome.storage.local.set({finiteUsage:FiniteUsage.record(finiteUsage,message)});
      respond({ok:true});
      return;
    }
    if (['GET_YOUTUBE_ACCESS','YOUTUBE_RECOMMENDATIONS','YOUTUBE_REVEAL'].includes(message?.type)) {
      const access = await youtubeAccess({type: message.type === 'YOUTUBE_RECOMMENDATIONS' ? 'REQUEST' : message.type === 'YOUTUBE_REVEAL' ? 'REVEAL' : 'GET'});
      const { still } = await chrome.storage.local.get('still');
      await updateBadge(normalize(still));
      respond({access});
      return;
    }
    if(['GET_LINKEDIN_ACCESS','LINKEDIN_UNLOCK','LINKEDIN_HIDE','LINKEDIN_CONSUME'].includes(message?.type)){
      let linkedinSender=false;try{linkedinSender=['linkedin.com','www.linkedin.com'].includes(new URL(sender.url).hostname);}catch{}
      if(!popupSender && !(linkedinSender && Number.isInteger(sender.tab?.id)))throw new Error('LinkedIn tab or popup required.');
      const type=message.type==='LINKEDIN_UNLOCK'?'UNLOCK':message.type==='LINKEDIN_HIDE'?'HIDE':message.type==='LINKEDIN_CONSUME'?'CONSUME':'GET';
      if(type==='CONSUME' && !linkedinSender)throw new Error('LinkedIn tab required.');
      const result=await linkedinAccess({...message,type});
      if(type!=='CONSUME'){const {still}=await chrome.storage.local.get('still');await updateBadge(normalize(still));}
      respond({...result,access:result.state});return;
    }
    if(message?.type==='LINKEDIN_STATUS'){
      const host=new URL(sender.url).hostname;
      if(!['linkedin.com','www.linkedin.com'].includes(host) || !Number.isInteger(sender.tab?.id))throw new Error('LinkedIn tab required.');
      const source=message.status||{};
      if(!['home','network'].includes(source.surface))throw new Error('Unknown LinkedIn view.');
      const limit=FiniteLinkedInPolicy.LIMITS[source.surface];
      const status={surface:source.surface,count:Math.max(0,Math.min(limit||10000,Math.floor(Number(source.count)||0))),limit,tabId:sender.tab.id};
      await chrome.storage.session.set({linkedinStatus:status});respond({ok:true});return;
    }
    if(message?.type==='GET_LINKEDIN' || message?.type==='LINKEDIN_RESET'){
      if(message.type==='LINKEDIN_RESET')throw new Error('Use the Home or recommendations unlock button.');
      const {linkedinStatus}=await chrome.storage.session.get('linkedinStatus');respond({linkedin:linkedinStatus||null});return;
    }
    if (message?.type === 'YOUTUBE_STATUS') {
      let youtubeSender = false;
      try { youtubeSender = ['youtube.com', 'www.youtube.com'].includes(new URL(sender.url).hostname); } catch {}
      if (!youtubeSender || !Number.isInteger(sender.tab?.id)) throw new Error('YouTube tab required.');
      const source = message.status || {};
      const surfaces = ['home', 'search', 'shorts', 'watch', 'channel', 'feed'];
      if (!surfaces.includes(source.surface)) throw new Error('Unknown YouTube view.');
      const limit = source.surface === 'shorts' ? 7 : source.surface === 'watch' ? 5 : 20;
      const count = Math.max(0, Math.min(limit, Number(source.count) || 0));
      const secondary = Math.max(0, Math.min(10, Number(source.secondary) || 0));
      const status = { surface: source.surface, count, limit, secondary, tabId: sender.tab.id };
      await chrome.storage.session.set({ youtubeStatus: status });
      respond({ ok: true });
      return;
    }
    if (message?.type === 'GET_YOUTUBE' || message?.type === 'YOUTUBE_RESET') {
      const { youtubeStatus } = await chrome.storage.session.get('youtubeStatus');
      if (message.type === 'YOUTUBE_RESET') {
        if (!youtubeStatus) throw new Error('Open a YouTube feed or Shorts tab first.');
        try { await chrome.tabs.sendMessage(youtubeStatus.tabId, { type: 'YOUTUBE_NEW_BATCH' }); }
        catch {
          await chrome.storage.session.remove('youtubeStatus');
          throw new Error('Open a YouTube tab, then try again.');
        }
      }
      respond({ youtube: youtubeStatus || null });
      return;
    }
    const stored = await chrome.storage.local.get('still');
    const before = normalize(stored.still);
    const result = reduce(before, message);
    if (JSON.stringify(stored.still) !== JSON.stringify(result.state)) {
      await chrome.storage.local.set({ still: result.state });
    }
    await updateBadge(result.state);
    respond(result);
  }).catch(error => respond({ error: error.message }));
  return true;
});

function settle() {
  queue = queue.catch(() => {}).then(async () => {
    const { still } = await chrome.storage.local.get('still');
    const { state } = reduce(still, { type: 'GET_STATE' });
    if (JSON.stringify(still) !== JSON.stringify(state)) await chrome.storage.local.set({ still: state });
    await updateBadge(state);
  });
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'still-expiry') settle(); });
chrome.runtime.onInstalled.addListener(details => {
  queue = queue.then(async () => {
    const { still } = await chrome.storage.local.get('still');
    const { state } = reduce(still, { type: 'GET_STATE' });
    const previous = (details.previousVersion || '0.0.0').split('.').map(Number);
    if (details.reason === 'update' && (previous[0] < 1 || (previous[0] === 1 && previous[1] < 2))) {
      // One-time migration for the pre-1.2 stuck batch; later updates preserve Instagram usage.
      state.batches.reels = { seen: [], generation: state.batches.reels.generation + 1 };
    }
    await chrome.storage.local.set({ still: state });
    await updateBadge(state);
  });
});
chrome.runtime.onStartup.addListener(settle);

// Remove script-created cookies too. Network cookie headers are blocked by the
// persistent browser rule even while the service worker is asleep.
chrome.cookies.onChanged.addListener(change => {
  if (change.removed || !InstagramLoginGuard.instagram(change.cookie.domain)) return;
  queue = queue.catch(()=>{}).then(async()=>{
    if (await InstagramLoginGuard.desired()) await InstagramLoginGuard.remove(change.cookie);
  }).catch(()=>{});
});
