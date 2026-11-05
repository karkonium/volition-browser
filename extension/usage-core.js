/* Local daily aggregates. Legacy access/batch storage is deliberately separate. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  function dayKey(now) {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function initial(now) { return {version:1, startedAt:now, days:{}}; }
  function bucket() { return {instagramMs:0,youtubeMs:0,linkedinMs:0,reels:[],posts:[],videos:[],linkedinPosts:[]}; }
  function record(raw, message, now = Date.now()) {
    const state = raw?.version === 1 ? structuredClone(raw) : initial(now);
    // Keep a month of aggregates; no page titles, account names, or URLs.
    for (const key of Object.keys(state.days)) if (key < dayKey(now - 30*DAY)) delete state.days[key];
    const site = message.site;
    if (!['instagram','youtube','linkedin'].includes(site)) return state;
    const ms = Math.max(0,Math.min(10000,Number(message.ms)||0));
    const start = now-ms;
    const midnight = new Date(now); midnight.setHours(0,0,0,0);
    const todayMs = Math.min(ms,now-midnight.getTime());
    for (const [when, amount] of [[now,todayMs],[start,ms-todayMs]]) {
      if (!amount) continue;
      const entry = state.days[dayKey(when)] ||= bucket();
      entry[`${site}Ms`] = (Number(entry[`${site}Ms`])||0)+amount;
    }
    const entry = state.days[dayKey(now)] ||= bucket();
    const kinds = site==='youtube'?['videos']:site==='linkedin'?['linkedinPosts']:['posts','reels'];
    for (const item of (Array.isArray(message.items) ? message.items : []).slice(0,30)) {
      if (!kinds.includes(item.kind) || !/^[a-f0-9]{16}$/.test(item.id)) continue;
      entry[item.kind] ||= [];
      if (entry[item.kind].length < 10000 && !entry[item.kind].includes(item.id)) entry[item.kind].push(item.id);
    }
    return state;
  }
  root.FiniteUsage = {dayKey,initial,bucket,record};
  if (typeof module !== 'undefined') module.exports = root.FiniteUsage;
})(globalThis);
