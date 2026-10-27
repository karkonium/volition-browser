(() => {
  'use strict';
  const site = location.hostname.endsWith('youtube.com') ? 'youtube' : 'instagram';
  let last = performance.now(), activeAt = last, elapsed = 0, sending = false, ticks = 0;
  let day = new Date().toDateString();
  const dwell = new Map(), counted = new Set(), pending = new Map();
  for (const type of ['pointerdown','pointermove','keydown','scroll','touchstart'])
    document.addEventListener(type, () => {activeAt=performance.now();}, {capture:true,passive:true});
  function visible(element) {
    if (!element?.isConnected || !element.checkVisibility()) return false;
    const r = element.getBoundingClientRect();
    const area = Math.max(0,Math.min(r.right,innerWidth)-Math.max(0,r.left))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(0,r.top));
    return r.width >= 100 && r.height >= 100 && area >= Math.min(r.width,innerWidth)*Math.min(r.height,innerHeight)*.5;
  }
  function playing(video) { return video && !video.paused && !video.ended && video.readyState >= 2; }
  async function hash(value) {
    const data = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${site}:${value}`));
    return [...new Uint8Array(data)].slice(0,8).map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function flush() {
    if (sending || (!elapsed && !pending.size)) return;
    sending = true;
    const ms = elapsed, entries = [...pending.entries()], items = entries.map(([,item])=>item); elapsed = 0; pending.clear();
    try {
      const result = await chrome.runtime.sendMessage({type:'RECORD_USAGE',site,ms,items});
      if (!result?.ok) throw new Error('Not recorded');
      if (result.accepted === false) for (const [key] of entries) counted.delete(key);
    } catch { /* An extension reload starts a new tracker; never affect the page. */ }
    finally {sending=false;}
  }
  async function tick() {
    const now = performance.now(), delta = Math.min(1500,now-last); last=now;
    if (day !== new Date().toDateString()) { day=new Date().toDateString(); counted.clear(); dwell.clear(); }
    const focused = document.visibilityState === 'visible' && document.hasFocus();
    let candidates=[];
    if (site === 'instagram') candidates = globalThis.FiniteScrollCandidates?.() || [];
    else if (location.pathname === '/watch' && !document.querySelector('#movie_player.ad-showing')) {
      const id = new URL(location.href).searchParams.get('v');
      const element = document.querySelector('#movie_player video,video.html5-main-video');
      if (id && element) candidates=[{kind:'videos',id,element}];
    }
    candidates=candidates.filter(item=>visible(item.element));
    const watching = candidates.some(item=>playing(item.element));
    const active = focused && (now-activeAt < 60000 || watching);
    if (active) elapsed += delta;
    const eligible = new Set();
    for (const item of candidates) {
      const key=`${item.kind}:${item.id}`;
      if (!active || (item.kind !== 'posts' && !playing(item.element))) continue;
      eligible.add(key);
      if (counted.has(key)) continue;
      const total=(dwell.get(key)||0)+delta; dwell.set(key,total);
      const threshold=item.kind==='videos'?5000:item.kind==='reels'?2000:1000;
      if (total < threshold) continue;
      counted.add(key);
      const id = await hash(key);
      pending.set(key,{kind:item.kind,id});
    }
    for (const key of dwell.keys()) if (!eligible.has(key)) dwell.delete(key);
    if (++ticks % 5 === 0 || pending.size) void flush();
  }
  setInterval(()=>void tick(),1000);
  document.addEventListener('visibilitychange',()=>{ if (document.hidden) void flush(); });
  window.addEventListener('pagehide',()=>void flush());
})();
