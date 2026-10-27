(() => {
  'use strict';
  const LIMIT = 20;
  const RECOMMENDATION_LIMIT = 5;
  const COMMENT_LIMIT = 10;
  const CARD = 'ytd-compact-video-renderer,ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-reel-item-renderer,ytd-channel-renderer,ytd-playlist-renderer,yt-lockup-view-model,ytd-backstage-post-thread-renderer,yt-shorts-lockup-view-model,ytm-shorts-lockup-view-model';
  let access = StillYouTubePolicy.initialState();
  let accessRequest = false;
  let lastAccessCheck = 0;
  let routeKey = '';
  let surface = '';
  let scheduled = false;
  let disconnected = false;
  let scanning = false;
  let lastStatus = '';
  let theatreApplied = false;
  let theatreAttempts = 0;
  let theatreAttemptAt = 0;
  let budgets = new Map();
  let commentBatch = null, commentSortSignature = null, commentSortPending = null, commentSortMenuOpen = false, ignoreSortSelectionChange = false;
  const boundaries = new Map();
  const identified = new WeakMap();
  let nextId = 0;

  function classify() {
    const path = location.pathname;
    if (/^\/shorts(?:\/|$)/.test(path)) return 'shorts';
    if (path === '/watch') return 'watch';
    if (path === '/results') return 'search';
    if (path === '/') return 'home';
    if (/^\/(?:@|channel\/|c\/|user\/)/.test(path)) return 'channel';
    if (/^\/feed\//.test(path)) return 'feed';
    return 'other';
  }
  function cleanup() {
    for (const name of ['overflow','continuation','empty-row','short-overflow','shorts-hidden']) {
      for (const node of document.querySelectorAll(`[data-still-yt-${name}]`)) node.removeAttribute(`data-still-yt-${name}`);
    }
    delete document.documentElement.dataset.stillYtLimit;
    boundaries.clear();
  }
  function checkRoute() {
    const next = classify();
    // Shorts routes are converted to the ordinary watch page below.
    const key = next === 'shorts' ? 'shorts' : location.pathname + location.search;
    if (key === routeKey && next === surface) return;
    cleanup();
    routeKey = key;
    surface = next;
    theatreApplied = false; theatreAttempts = 0; theatreAttemptAt = 0;
    budgets = new Map();
    commentBatch=null;commentSortSignature=null;commentSortPending=null;commentSortMenuOpen=false;ignoreSortSelectionChange=false;
    lastStatus = '';
  }
  function recommendationsOpen() { return access.until > Date.now(); }
  function applyRecommendationAccess() {
    if (!document.documentElement) return;
    document.documentElement.dataset.stillYtSurface = classify();
    document.documentElement.dataset.stillYtRecommendations = recommendationsOpen() ? 'open' : 'closed';
    const browse = [...document.querySelectorAll('ytd-browse')].find(node => !node.hidden);
    for (const node of document.querySelectorAll('ytd-browse')) node.toggleAttribute('data-still-yt-home', surface === 'home' && node === browse);
    if (!recommendationsOpen() && surface === 'home') boundaries.clear();
  }
  async function syncAccess() {
    if (accessRequest || disconnected) return;
    accessRequest = true; lastAccessCheck = Date.now();
    try {
      const result = await chrome.runtime.sendMessage({type:'GET_YOUTUBE_ACCESS'});
      if (result?.access) access = StillYouTubePolicy.normalize(result.access);
      applyRecommendationAccess(); schedule();
    } catch { disconnected = true; }
    finally { accessRequest = false; }
  }
  function normalVideoURL(input) {
    let url;
    try { url = new URL(input, location.origin); } catch { return null; }
    if (!['youtube.com','www.youtube.com'].includes(url.hostname)) return null;
    const id = url.pathname.match(/^\/shorts\/([^/]+)\/?$/)?.[1];
    if (!id) return null;
    url.pathname = '/watch'; url.searchParams.set('v',id); url.hash = '';
    return url.href;
  }
  function rewriteSearchShorts() {
    if (surface !== 'search') return;
    for (const link of document.querySelectorAll('a[href]')) {
      const url = normalVideoURL(link.href);
      if (!url) continue;
      link.href = url;
      link.dataset.stillYtNormalShort = '';
    }
  }
  window.addEventListener('click', event => {
    if (classify() !== 'search') return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = normalVideoURL(link.href) || (link.hasAttribute('data-still-yt-normal-short') ? link.href : null);
    if (!url) return;
    link.href = url;
    // Bypass YouTube's bound Shorts endpoint, including SPA interception.
    event.stopImmediatePropagation();
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (link.target && link.target !== '_self')) return;
    event.preventDefault(); location.assign(url);
  }, true);
  function hideRecommendedShorts(root) {
    if (!root) return;
    for (const node of root.querySelectorAll('[data-still-yt-shorts-hidden]')) node.removeAttribute('data-still-yt-shorts-hidden');
    for (const node of root.querySelectorAll('ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],ytd-rich-section-renderer:has(a[href*="/shorts/"]),yt-shorts-lockup-view-model,ytm-shorts-lockup-view-model,ytd-reel-item-renderer')) node.dataset.stillYtShortsHidden = '';
    for (const card of outerCards(root,CARD)) {
      if (card.querySelector('a[href*="/shorts/"],yt-shorts-lockup-view-model,ytm-shorts-lockup-view-model') || card.matches('yt-shorts-lockup-view-model,ytm-shorts-lockup-view-model,ytd-reel-item-renderer')) card.dataset.stillYtShortsHidden = '';
    }
  }
  function containerFor(target) {
    let node = target instanceof Element ? target : null;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.scrollHeight > node.clientHeight + 60 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function clamp(container) {
    const max = boundaries.get(container);
    if (max === undefined || container.scrollTop <= max + 1) return false;
    const old = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';
    container.scrollTop = max;
    container.style.scrollBehavior = old;
    return true;
  }
  function bound(container, max) {
    boundaries.set(container, Math.max(0, max));
    clamp(container);
    document.documentElement.dataset.stillYtLimit = surface;
  }
  function visibleArea(node) {
    const r = node.getBoundingClientRect();
    return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(0, r.left));
  }
  function contentId(node) {
    if (node.matches('ytd-comment-thread-renderer')) {
      const explicit = node.getAttribute('comment-id') || node.dataset.commentId;
      if (explicit) return `comment-${explicit}`;
      for (const link of node.querySelectorAll('a[href]')) {
        try {
          const id = new URL(link.getAttribute('href'), location.origin).searchParams.get('lc');
          if (id) return `comment-${id}`;
        } catch {}
      }
      if (!node.textContent.trim()) return '';
      if (!identified.has(node)) identified.set(node, `comment-${++nextId}`);
      return identified.get(node);
    }
    const videoId = node.getAttribute('video-id') || node.dataset.videoId;
    if (videoId) return videoId;
    for (const link of node.querySelectorAll('a[href]')) {
      try {
        const url = new URL(link.getAttribute('href'), location.origin);
        const id = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|post)\/([^/]+)/)?.[1];
        if (id) return id;
      } catch { /* Incomplete links are filled in by YouTube later. */ }
    }
    if (!node.textContent.trim() && !node.querySelector('img,video')) return '';
    if (!identified.has(node)) identified.set(node, `item-${++nextId}`);
    return identified.get(node);
  }
  function outerCards(root, selector) {
    return [...root.querySelectorAll(selector)].filter(node => {
      const parent = node.parentElement?.closest(selector);
      return !parent || !root.contains(parent);
    });
  }
  function beginCommentSort() {
    const root=document.querySelector('ytd-comments');
    if(!root || commentSortPending)return;
    const nodes=[...root.querySelectorAll('ytd-comment-thread-renderer')];
    commentSortPending=commentBatch?{...commentBatch}:{root,nodes:new Set(nodes),ids:new Set(nodes.map(contentId)),empty:!nodes.length};
  }
  // The native menu may be rendered in a portal outside the comments element.
  document.addEventListener('click',event=>{
    if(classify()!=='watch')return;
    const target=event.target instanceof Element?event.target:null;
    const control=target?.closest('ytd-sort-filter-sub-menu-renderer,yt-sort-filter-sub-menu-renderer');
    const item=target?.closest('tp-yt-paper-item,[role="option"],[role="menuitem"],[role="menuitemradio"]');
    if(item && (control?.closest('ytd-comments') || commentSortMenuOpen)){
      if(!item.matches('[aria-selected="true"],[aria-checked="true"],.iron-selected,[selected]')){
        beginCommentSort();ignoreSortSelectionChange=true;
      }
      commentSortMenuOpen=false;
    }else commentSortMenuOpen=!!control?.closest('ytd-comments');
  },true);
  function finiteComments(root) {
    if(!root)return 0;
    const sort=root.querySelector('ytd-sort-filter-sub-menu-renderer,yt-sort-filter-sub-menu-renderer');
    const list=sort?.querySelector('tp-yt-paper-listbox,[role="listbox"]');
    const selected=sort?.querySelector('[aria-selected="true"],[aria-checked="true"],.iron-selected');
    const index=list?.getAttribute('selected');
    const signature=index!==null && index!==undefined?`index:${index}`:selected?.textContent.trim()||sort?.querySelector('.selected-item')?.textContent.trim()||'';
    if(commentSortSignature!==null && signature!==commentSortSignature && signature){
      if(ignoreSortSelectionChange)ignoreSortSelectionChange=false;else beginCommentSort();
    }
    commentSortSignature=signature;
    if(commentSortPending){
      const pending=commentSortPending,nodes=[...root.querySelectorAll('ytd-comment-thread-renderer')];
      if(!nodes.length){pending.empty=true;return 0;}
      // Wait for the sorted response. Re-admitting the old DOM here would use up
      // all ten places before the requested Newest/Top batch arrives.
      const changed=pending.empty || root!==pending.root || nodes.every(node=>!pending.nodes.has(node)) || nodes.some(node=>!pending.ids.has(contentId(node)));
      if(!changed)return budgets.get('comments')?.size||0;
      budgets.delete('comments');commentSortPending=null;
      for(const node of root.querySelectorAll('[data-still-yt-overflow],[data-still-yt-continuation]')){
        node.removeAttribute('data-still-yt-overflow');node.removeAttribute('data-still-yt-continuation');
      }
    }
    const count=finite(root,'comments','ytd-comment-thread-renderer',false,COMMENT_LIMIT);
    const nodes=[...root.querySelectorAll('ytd-comment-thread-renderer')];
    commentBatch={root,nodes:new Set(nodes),ids:new Set(nodes.map(contentId)),empty:!nodes.length};
    return count;
  }
  function finite(root, name, selector, clampPage, limit = LIMIT) {
    if (!root) return 0;
    let seen = budgets.get(name);
    if (!seen) { seen = new Set(); budgets.set(name, seen); }
    const admitted = [];
    for (const card of outerCards(root, selector)) {
      if (card.closest('[data-still-yt-shorts-hidden]')) continue;
      const id = contentId(card);
      if (!id) continue;
      if (!seen.has(id) && seen.size >= limit) {
        card.dataset.stillYtOverflow = '';
        card.querySelectorAll('video').forEach(video => video.pause());
      } else {
        seen.add(id);
        delete card.dataset.stillYtOverflow;
        admitted.push(card);
      }
    }
    if (seen.size >= limit) {
      for (const node of root.querySelectorAll('ytd-continuation-item-renderer')) {
        if(name==='comments' && node.closest('ytd-comment-thread-renderer'))continue;
        node.dataset.stillYtContinuation = '';
      }
      for (const row of root.querySelectorAll('ytd-rich-grid-row')) {
        const cards = [...row.querySelectorAll('ytd-rich-item-renderer')];
        row.toggleAttribute('data-still-yt-empty-row', cards.length > 0 && cards.every(card => card.hasAttribute('data-still-yt-overflow') || card.hasAttribute('data-still-yt-shorts-hidden')));
      }
      if (clampPage && admitted.length) {
        const last = admitted.reduce((a, b) => a.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom ? a : b);
        const container = containerFor(last);
        const bottom = container === document.scrollingElement ? innerHeight : container.getBoundingClientRect().bottom;
        bound(container, container.scrollTop + last.getBoundingClientRect().bottom - bottom + 24);
      }
    }
    return seen.size;
  }
  async function publish(count, secondary = 0) {
    if (document.visibilityState !== 'visible' || surface === 'other') return;
    const status = { surface, count, limit: surface === 'watch' ? RECOMMENDATION_LIMIT : LIMIT, secondary };
    const next = JSON.stringify(status);
    if (next === lastStatus) return;
    lastStatus = next;
    try {
      await chrome.runtime.sendMessage({ type: 'YOUTUBE_STATUS', status });
    } catch { disconnected = true; }
  }
  function defaultTheatre() {
    if (theatreApplied || document.fullscreenElement) return;
    const watch = document.querySelector('ytd-watch-flexy');
    if (!watch || watch.hidden) return;
    if (watch.hasAttribute('theater')) { theatreApplied = true; return; }
    const button = watch.querySelector('.ytp-size-button') || document.querySelector('#movie_player .ytp-size-button');
    if (!button || button.disabled || theatreAttempts >= 3 || Date.now() - theatreAttemptAt < 1000) return;
    theatreAttempts++; theatreAttemptAt = Date.now();
    button.click();
    if (watch.hasAttribute('theater')) theatreApplied = true;
  }
  const playerNavigation = '#movie_player .ytp-next-button,#movie_player .ytp-prev-button,#movie_player .ytp-ce-element,#movie_player .ytp-videowall-still,#movie_player .ytp-autonav-endscreen-upnext-container,#movie_player .ytp-cards-button,#movie_player .ytp-cards-teaser,#movie_player .ytp-cards';
  document.addEventListener('click', event => {
    if (classify() === 'watch' && event.target.closest?.(playerNavigation)) block(event);
  }, true);
  window.addEventListener('keydown', event => {
    if (classify() !== 'watch' || event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && ['n','p'].includes(event.key.toLowerCase())) block(event);
  }, true);
  function scan() {
    if (scanning || disconnected || !document.documentElement) return;
    scanning = true;
    try {
      checkRoute();
      applyRecommendationAccess();
      rewriteSearchShorts();
      if (surface === 'shorts') {
        const url = normalVideoURL(location.href);
        if (url) location.replace(url);
      } else if (surface === 'watch') {
        defaultTheatre();
        // Each column ends independently; the player and playlist queue are untouched.
        const related = document.querySelector('ytd-watch-flexy #related, #related');
        hideRecommendedShorts(related);
        const count = finite(related, 'related', 'ytd-compact-video-renderer,yt-lockup-view-model,ytd-video-renderer', false, RECOMMENDATION_LIMIT);
        const comments = document.querySelector('ytd-comments');
        const secondary = finiteComments(comments);
        void publish(count, secondary);
      } else if (surface !== 'other') {
        const root = surface === 'search' ? document.querySelector('ytd-search') : document.querySelector('ytd-browse');
        if (surface === 'home') hideRecommendedShorts(root);
        const count = finite(root, 'feed', CARD, surface !== 'home' || recommendationsOpen());
        void publish(count);
      }
    } finally { scanning = false; }
  }
  function schedule() {
    if (scheduled || disconnected) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 80);
  }
  function block(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  document.addEventListener('wheel', event => {
    if (event.deltaY <= 0) return;
    const container = containerFor(event.target);
    const max = boundaries.get(container);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (max !== undefined && container.scrollTop + delta > max) { block(event); container.scrollTop = max; }
  }, { capture: true, passive: false });
  let touchY = null;
  document.addEventListener('touchstart', event => { touchY = event.touches[0]?.clientY ?? null; }, { capture: true, passive: true });
  document.addEventListener('touchmove', event => {
    if (touchY === null || !event.touches[0]) return;
    const container = containerFor(event.target);
    const max = boundaries.get(container);
    if (max !== undefined && container.scrollTop >= max - 2 && event.touches[0].clientY < touchY) block(event);
  }, { capture: true, passive: false });
  document.addEventListener('scroll', event => {
    const container = event.target === document ? document.scrollingElement : event.target;
    if (clamp(container)) event.stopImmediatePropagation();
    schedule();
  }, { capture: true, passive: true });
  document.addEventListener('yt-navigate-finish', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', () => { lastStatus = ''; schedule(); });
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== 'YOUTUBE_NEW_BATCH' || sender.id !== chrome.runtime.id) return;
    respond({ ok: true });
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    location.reload();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.youtubeAccess) {
      access = StillYouTubePolicy.normalize(changes.youtubeAccess.newValue);
      applyRecommendationAccess(); schedule();
    }
  });
  setInterval(() => {
    applyRecommendationAccess();
    if (access.readyAt && Date.now() >= access.readyAt && Date.now() - lastAccessCheck > 900) void syncAccess();
    schedule();
  }, 500);
  applyRecommendationAccess();
  void syncAccess();
  schedule();
})();
