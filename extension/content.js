(() => {
  'use strict';
  const Core = StillCore;
  let state = Core.initialState();
  let ready = false;
  let currentRoute = Core.route(location.pathname);
  let lastPath = location.pathname;
  let quietReason = '';
  let scheduled = false;
  let scanning = false;
  let rescan = false;
  let disconnected = false;
  const explorePosts = new Set();
  let exploreFrozen = false;
  let selectedExplorePost = '';
  const searchSessionKey = 'still-initial-search-batch';
  try {
    const saved = JSON.parse(sessionStorage.getItem(searchSessionKey) || 'null');
    if (saved && (Core.route(location.pathname) === 'explore' || !!searchPostId(location.pathname))) {
      for (const id of saved.posts || []) if (typeof id === 'string') explorePosts.add(id);
      exploreFrozen = explorePosts.size > 0;
      selectedExplorePost = saved.selected || '';
      if (searchPostId(location.pathname) && searchPostId(location.pathname) !== selectedExplorePost) clearSearchSession();
    } else sessionStorage.removeItem(searchSessionKey);
  } catch { /* Session storage may be unavailable. The in-page batch still works. */ }
  function searchPostId(path) {
    const id = path.match(/^\/(?:[^/]+\/)?(?:p|reels?)\/([^/]+)\/?$/)?.[1];
    return id && !['audio', 'saved', 'liked_by'].includes(id) ? id : '';
  }
  function saveSearchSession() {
    try { sessionStorage.setItem(searchSessionKey, JSON.stringify({ posts: [...explorePosts], selected: selectedExplorePost })); } catch {}
  }
  function isSearchViewer() { return exploreFrozen && !!selectedExplorePost && !!searchPostId(location.pathname); }
  function clearSearchSession() {
    explorePosts.clear(); exploreFrozen = false; selectedExplorePost = '';
    try { sessionStorage.removeItem(searchSessionKey); } catch {}
  }
  let searchPanel = null;
  const boundaries = new Map();
  let lastReelPosition = null;
  let activeReelId = '';
  const checked = new WeakMap();
  const carousels = new WeakMap();
  const carouselPositions = new Map();
  const homePosts = new Set();
  let dockHost, dockShadow;

  function applyAccess() {
    if (!document.documentElement) return;
    for (const feature of Core.FEATURES) {
      document.documentElement.dataset[`still${feature[0].toUpperCase()}${feature.slice(1)}`] = ready && Core.isRevealed(state, feature) ? 'open' : 'closed';
    }
    // Only navigation entry points expire, never content or social dialogs.
    if (quietReason === 'loading' || quietReason.startsWith('locked:')) clearQuiet();
  }

  // The requested small Reel counter is the only on-page extension UI.
  const uiCSS = `
    :host{all:initial;color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    *{box-sizing:border-box}.reel-counter{position:fixed;right:20px;top:20px;z-index:2147483646;width:130px;padding:11px 13px;background:#202020ed;color:#f5f5f5;border:1px solid #ffffff24;border-radius:10px;pointer-events:none}.counter-labels,.counter-values,.counter-footer{display:flex;justify-content:space-between;align-items:baseline}.counter-labels{font-size:7px;letter-spacing:.8px;color:#aaa}.counter-values{margin:7px 0;font-variant-numeric:tabular-nums}.counter-values strong{font-size:25px;font-weight:600}.counter-values span{font-size:20px;color:#aaa}.counter-footer{font-size:8px;color:#aaa}.counter-footer b{font-weight:400;font-variant-numeric:tabular-nums}
  `;

  function makeHost(name) {
    const host = document.createElement('div');
    host.dataset.stillUi = name;
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = uiCSS;
    shadow.append(style);
    return [host, shadow];
  }
  function appendHost(host) {
    if (!host.isConnected) (document.body || document.documentElement)?.append(host);
  }
  function quietSurface(reason) {
    if (!document.documentElement) return;
    quietReason = reason;
    // Keep Instagram's navigation and URL. Only its unavailable content is blank.
    document.documentElement.dataset.stillQuiet = currentRoute;
    document.querySelectorAll('video').forEach(video => video.pause());
    dockHost?.remove();
  }
  function clearQuiet() {
    quietReason = '';
    delete document.documentElement.dataset.stillQuiet;
  }
  async function send(message) {
    try {
      const result = await chrome.runtime.sendMessage(message);
      if (!result || result.error) throw new Error(result?.error || 'Unavailable');
      state = Core.normalize(result.state);
      return result;
    } catch {
      disconnected = true;
      quietSurface('offline');
      return null;
    }
  }
  function visible(element, margin = 0) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > -margin && rect.top < innerHeight + margin;
  }
  function postId(element) {
    const links = [...element.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]')];
    const match = links.map(link => link.getAttribute('href')?.match(/\/(?:p|reels?)\/([^/?#]+)/)).find(match => match && !['audio', 'liked_by', 'saved'].includes(match[1]));
    if (match) return match[1];
    const media = element.querySelector('video, img');
    const source = media?.currentSrc || media?.src || '';
    // A media URL is only a last resort, and only its stable path is stored locally.
    if (source) {
      try { return new URL(source).pathname.slice(-250); } catch { return null; }
    }
    if (currentRoute === 'reels') {
      const routeId = location.pathname.match(/^\/(?:[^/]+\/)?reels?\/([^/]+)/)?.[1];
      if (routeId && visible(element)) return routeId;
    }
    return null;
  }

  function isPostPage() { return /^\/(?:[^/]+\/)?p\/[^/]+/.test(location.pathname); }
  function mediaDialog() {
    if (Core.route(location.pathname) === 'stories' || /^\/(?:direct|accounts|create)(?:\/|$)/.test(location.pathname)) return null;
    // Profile viewers can retain /username/ or /username/reels/ instead of
    // navigating to /p/ or /reel/. Do not confuse follower dialogs with media.
    return [...document.querySelectorAll('[role="dialog"]')].find(dialog => visible(dialog) && [...dialog.querySelectorAll('video,img')].some(media => {
      const rect = media.getBoundingClientRect();
      return visible(media) && rect.width >= 150 && rect.height >= 150;
    })) || null;
  }
  function hasPhotoCarousel(article) {
    if (!article) return false;
    const largePhotos = [...article.querySelectorAll('img')].filter(image => {
      const rect = image.getBoundingClientRect(); return rect.width >= 100 && rect.height >= 100;
    });
    return largePhotos.filter(image => image.closest('ul li')).length >= 2 ||
      (largePhotos.length > 0 && !!article.querySelector('[aria-roledescription="carousel"],[aria-label^="Go to slide "]'));
  }

  function outerPostControl(button) {
    const label = `${button.getAttribute('aria-label') || ''} ${button.querySelector('svg')?.getAttribute('aria-label') || ''}`.trim();
    if (/^(?:next post|previous post)(?:\s|$)/i.test(label)) return true;
    if (!/^(?:next|previous|go back|left chevron|right chevron)(?:\s|$)/i.test(label)) return false;
    // Some Instagram layouts put BOTH sets of arrows inside one article.
    // Only arrows over the actual photo/video frame belong to its carousel.
    const scope = button.closest('article,[role="article"]') || document.querySelector('article,[role="article"]');
    if (!scope) return true;
    if (!hasPhotoCarousel(scope)) return true;
    const rect = button.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
    const insideMedia = [...scope.querySelectorAll('img,video')].some(media => {
      const r = media.getBoundingClientRect();
      return r.width >= 100 && r.height >= 100 && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8;
    });
    if (insideMedia || button.closest('ul,[aria-roledescription="carousel"]')) return false;
    return true;
  }
  function markPostControls() {
    const controls = new Set(document.querySelectorAll('button,[role="button"],a[aria-label],a:has(svg[aria-label]),[data-still-no-horizontal]'));
    for (const icon of document.querySelectorAll('svg[aria-label]')) {
      if (/^(?:next|previous|go back|left chevron|right chevron)(?:\s|$)/i.test(icon.getAttribute('aria-label'))) controls.add(icon.closest('button,[role="button"],a') || icon.parentElement);
    }
    const viewer = isPostPage() || currentRoute === 'reels' || currentRoute === 'explore' || !!mediaDialog();
    for (const button of controls) {
      // Measure native placement before hiding; hidden controls otherwise have zero-sized bounds.
      button.removeAttribute('data-still-no-horizontal');
      button.toggleAttribute('data-still-no-horizontal', viewer && outerPostControl(button));
    }
  }
  function markReelControls() {
    const atLast = currentRoute === 'reels' && state.batches.reels.seen.length >= Core.LIMITS.reels && activeReelId === state.batches.reels.seen.at(-1);
    for (const button of document.querySelectorAll('button,[role="button"]')) {
      const label = `${button.getAttribute('aria-label') || ''} ${button.querySelector('svg')?.getAttribute('aria-label') || ''}`.trim();
      const next = /^(next|down|next reel|next video|navigate to next reel)(\s|$)/i.test(label);
      const previous = /^(previous|up|navigate to previous reel)(\s|$)/i.test(label);
      button.toggleAttribute('data-still-no-down', (atLast && next) || (isSearchViewer() && currentRoute === 'reels' && (next || previous)));
    }
  }
  function checkHome() {
    let last;
    for (const article of document.querySelectorAll('main article,[role="main"] article,article')) {
      const id = postId(article);
      if (!id) continue;
      if (!homePosts.has(id) && homePosts.size >= Core.LIMITS.home) {
        article.dataset.stillOverLimit = '';
        continue;
      }
      homePosts.add(id);
      delete article.dataset.stillOverLimit;
      last = article;
    }
    if (last && homePosts.size >= Core.LIMITS.home) {
      const container = scrollContainer(last);
      const bottom = container === document.scrollingElement ? innerHeight : container.getBoundingClientRect().bottom;
      setBoundary(container, container.scrollTop + last.getBoundingClientRect().bottom - bottom);
    }
  }

  function findSearchPanel() {
    if (/^\/(direct|accounts)\//.test(location.pathname)) return null;
    for (const input of document.querySelectorAll('input[placeholder*="search" i], input[aria-label="Search input"]')) {
      if (!visible(input)) continue;
      const bounds = input.getBoundingClientRect();
      if (bounds.right <= 0 || bounds.left >= innerWidth) continue;
      let parent = input.parentElement;
      while (parent && parent !== document.body) {
        if ([...parent.querySelectorAll('h1,h2,[role="heading"]')].some(heading => heading.textContent.trim().toLowerCase() === 'search') && parent.getBoundingClientRect().height > 200) return parent;
        if (parent.matches('[role="dialog"]')) break;
        parent = parent.parentElement;
      }
    }
    return null;
  }

  function checkCarousels() {
    for (const article of document.querySelectorAll('article, [role="article"], [role="dialog"]')) {
      for (const list of article.querySelectorAll('ul, [aria-roledescription="carousel"]')) {
        const slides = [...list.children].filter(child => child.querySelector('img,video'));
        if (slides.length < 2) continue;
        const bounds = list.parentElement.getBoundingClientRect();
        let position = 1;
        let nearest = Infinity;
        slides.forEach((slide, index) => {
          if (index >= Core.LIMITS.carousel) slide.dataset.stillCarouselBlocked = '';
          const media = slide.querySelector('img,video');
          const rect = media.getBoundingClientRect();
          const distance = Math.abs((rect.left + rect.right) / 2 - (bounds.left + bounds.right) / 2);
          if (rect.width > 0 && distance < nearest) { nearest = distance; position = index + 1; }
        });
        const dots = article.querySelectorAll('[aria-label^="Go to slide "]');
        // Virtualized carousels only mount nearby slides; those DOM indices are not slide numbers.
        if (nearest < Infinity && (!dots.length || slides.length >= dots.length)) {
          carousels.set(article, position);
          const id = postId(article);
          if (id) carouselPositions.set(id, position);
        }
      }
    }
  }

  async function checkPosts(feature) {
    const generation = state.batches[feature].generation;
    let candidates = [...document.querySelectorAll('main article, [role="main"] article, main [role="article"], [role="main"] [role="article"]')];
    if (!candidates.length) candidates = [...document.querySelectorAll('article')];
    if (feature === 'reels') {
      // Home can remain mounted behind Instagram's modal Reel viewer.
      // Choose the active video before considering any background articles.
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(node => visible(node) && node.querySelector('video'));
      const videos = [...(dialog || document).querySelectorAll('video')].filter(video => visible(video) && getComputedStyle(video).visibility !== 'hidden').sort((a, b) => {
        const area = video => { const r = video.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(0, r.left)); };
        return area(b) - area(a);
      });
      if (videos.length) {
        const video = videos[0];
        const article = video.closest('article,[role="article"]');
        const routeId = location.pathname.match(/^\/(?:[^/]+\/)?reels?\/([^/]+)/)?.[1];
        const id = routeId && routeId !== 'audio' ? routeId : postId(article || video.parentElement);
        if (!id) return;
        activeReelId = id;
        const result = await send({ type: 'CONSUME', feature, id, generation });
        if (result && !result.allowed && !result.stale) stopReels(article || video.parentElement);
        if (result?.allowed) rememberReel(article || video, id);
        return;
      }
    }
    let lastAllowed;
    let denied = false;
    for (const article of candidates) {
      if (!article.isConnected) continue;
      const id = postId(article);
      if (!id) continue;
      const key = `${feature}:${generation}:${id}`;
      if (feature === 'reels' && state.batches.reels.seen.length >= Core.LIMITS.reels && !state.batches.reels.seen.includes(id)) {
        article.dataset.stillOverLimit = '';
        article.querySelectorAll('video').forEach(video => video.pause());
        continue;
      }
      const previous = checked.get(article);
      if (previous?.key === key) {
        if (previous.allowed) {
          lastAllowed = article;
          if (feature === 'reels' && visible(article)) rememberReel(article, id);
        }
        else denied = true;
        if (feature === 'reels' && !previous.allowed) stopReels(article);
        continue;
      }
      // Charge the active reel, not its prefetched neighbours.
      if (feature === 'reels') {
        const rect = article.getBoundingClientRect();
        if (!visible(article) || rect.top > innerHeight * .6 || rect.bottom < innerHeight * .4) continue;
      }
      article.dataset.stillChecking = '';
      const result = await send({ type: 'CONSUME', feature, id, generation });
      if (!result) return;
      if (result.stale || currentRoute !== feature || state.batches[feature].generation !== generation) {
        delete article.dataset.stillChecking;
        schedule();
        return;
      }
      checked.set(article, { key, allowed: result.allowed });
      delete article.dataset.stillChecking;
      if (result.allowed) {
        delete article.dataset.stillOverLimit;
        lastAllowed = article;
        if (feature === 'reels') rememberReel(article, id);
      } else {
        denied = true;
        if (feature === 'reels') {
          stopReels(article);
          return;
        }
        article.dataset.stillOverLimit = '';
      }
    }
  }
  function scrollContainer(target) {
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body && element !== document.documentElement) {
      if (element.scrollHeight > element.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return element;
      element = element.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function setBoundary(container, max) {
    const previous = boundaries.get(container);
    boundaries.set(container, previous === undefined ? Math.max(0, max) : Math.min(previous, Math.max(0, max)));
    clampScroll(container);
    document.documentElement.dataset.stillLimit = currentRoute;
  }
  function clampScroll(container) {
    const max = boundaries.get(container);
    if (max === undefined || container.scrollTop <= max + 1) return false;
    const behavior = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';
    container.scrollTop = max;
    container.style.scrollBehavior = behavior;
    return true;
  }
  function rememberReel(element, id) {
    activeReelId = id;
    const container = scrollContainer(element);
    const rect = element.getBoundingClientRect();
    const top = container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
    const position = element.matches('video') ? container.scrollTop : Math.max(0, container.scrollTop + rect.top - top);
    lastReelPosition = { container, position };
    if (state.batches.reels.seen.indexOf(id) === Core.LIMITS.reels - 1) setBoundary(container, position);
  }
  function stopReels(element) {
    element?.querySelectorAll('video').forEach(video => video.pause());
    if (element?.matches('article, [role="article"]')) element.dataset.stillOverLimit = '';
    const fallback = lastReelPosition || { container: scrollContainer(element), position: scrollContainer(element).scrollTop };
    if (!boundaries.has(fallback.container)) setBoundary(fallback.container, fallback.position);
    else clampScroll(fallback.container);
    updateDock();
  }
  function checkExplore() {
    if (currentRoute !== 'explore' || !ready) return;
    const root = searchPanel || document.querySelector('main,[role="main"]');
    if (!root) return;
    const cards = [...root.querySelectorAll('a[href]')].filter(link => searchPostId(new URL(link.href, location.origin).pathname));
    // Freeze the first nonempty rendered batch. Never admit a later fetch merely
    // because the old fixed budget has space left.
    if (!exploreFrozen && cards.length) {
      for (const card of cards) explorePosts.add(searchPostId(new URL(card.href, location.origin).pathname));
      exploreFrozen = true;
      saveSearchSession();
    }
    for (const card of cards) card.toggleAttribute('data-still-over-limit', exploreFrozen && !explorePosts.has(searchPostId(new URL(card.href, location.origin).pathname)));
    if (exploreFrozen) {
      for (const node of root.querySelectorAll('[role="progressbar"], [aria-label="Loading..."]')) node.dataset.stillOverLimit = '';
      for (const row of root.querySelectorAll('div')) {
        const children = [...row.children];
        if (children.length && children.every(child => child.hasAttribute('data-still-over-limit'))) row.dataset.stillOverLimit = '';
      }
    }
  }
  function searchViewerMedia() {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(node => visible(node) && node.querySelector('video,img'));
    const article = [...document.querySelectorAll('article,[role="article"]')].find(node => postId(node) === selectedExplorePost);
    const root = dialog || article || document;
    return [...root.querySelectorAll('video,article img,[role="article"] img,img')].filter(media => visible(media)).sort((a,b) => {
      const area = element => { const r = element.getBoundingClientRect(); return r.width * r.height; };
      return area(b) - area(a);
    })[0];
  }
  function insidePostScroller(target) {
    const container = scrollContainer(target);
    const media = searchViewerMedia();
    // Comments have their own scroll container, separate from the media feed.
    return media && container !== document.scrollingElement && !container.contains(media);
  }
  function checkSearchViewer() {
    if (!isSearchViewer()) return;
    const media = searchViewerMedia();
    if (media && currentRoute === 'reels') {
      const container = scrollContainer(media);
      if (!boundaries.has(container)) setBoundary(container, container.scrollTop);
    }
    for (const article of document.querySelectorAll('article,[role="article"]')) {
      const id = [...article.querySelectorAll('a[href]')].map(link => searchPostId(new URL(link.href, location.origin).pathname)).find(Boolean);
      if (id && id !== selectedExplorePost && !article.contains(media)) {
        article.dataset.stillOverLimit = '';
        article.querySelectorAll('video').forEach(video => video.pause());
      }
    }
  }
  function updateDock() {
    if (quietReason || currentRoute !== 'reels') { dockHost?.remove(); return; }
    if (!dockHost) [dockHost, dockShadow] = makeHost('status');
    appendHost(dockHost);
    let counter = dockShadow.querySelector('.reel-counter');
    if (!counter) {
      counter = document.createElement('aside');
      counter.className = 'reel-counter';
      counter.setAttribute('aria-label', 'Reels viewed and batch limit');
      counter.innerHTML = '<div class="counter-labels"><span>REELS SEEN</span><span>LIMIT</span></div><div class="counter-values" role="status" aria-live="polite"><strong>0</strong><span>/ 10</span></div><div class="counter-footer"><b></b></div>';
      dockShadow.append(counter);
    }
    const count = state.batches.reels.seen.length;
    const number = counter.querySelector('strong');
    if (number.textContent !== String(count)) number.textContent = String(count);
    counter.querySelector('b').textContent = count >= Core.LIMITS.reels ? 'Limit reached' : 'Ten per batch';
    dockHost.dataset.stillViewed = String(count);
  }
  function handleRoute() {
    searchPanel = findSearchPanel();
    if (searchPanel) searchPanel.dataset.stillQuietContent = '';
    const dialog = mediaDialog();
    const reelDialog = !isPostPage() && !!dialog?.querySelector('video');
    const next = reelDialog ? 'reels' : searchPanel ? 'explore' : Core.route(location.pathname);
    if (location.pathname === lastPath && next === currentRoute) return;
    lastPath = location.pathname;
    if (next !== currentRoute) {
      clearQuiet();
      homePosts.clear();
      const enteringSearchPost = exploreFrozen && !!searchPostId(location.pathname);
      const retainSearchSnapshot = exploreFrozen && (next === 'explore' || enteringSearchPost);
      document.querySelectorAll('[data-still-over-limit],[data-still-checking]').forEach(element => {
        if (!retainSearchSnapshot) delete element.dataset.stillOverLimit;
        delete element.dataset.stillChecking;
      });
      if (next !== 'explore' && !enteringSearchPost) clearSearchSession();
      boundaries.clear();
      lastReelPosition = null;
      activeReelId = '';
      delete document.documentElement.dataset.stillLimit;
    }
    currentRoute = next;
    applyAccess();
  }
  async function scan() {
    if (scanning) { rescan = true; return; }
    scanning = true;
    try {
      handleRoute();
      applyAccess();
      markPostControls();
      checkCarousels();
      if (ready && !quietReason && !disconnected) {
        if (currentRoute === 'reels') await checkPosts('reels');
        if (currentRoute === 'home') checkHome();
        if (currentRoute === 'explore') checkExplore();
      }
      checkSearchViewer();
      markReelControls();
      updateDock();
    } finally {
      scanning = false;
      if (rescan) { rescan = false; schedule(); }
    }
  }
  function schedule() {
    if (scheduled || disconnected) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; void scan(); }, 100);
  }

  function blockEvent(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  window.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || !exploreFrozen) return;
    let id = '';
    try { id = searchPostId(new URL(link.href, location.origin).pathname); } catch {}
    if (!id) return;
    if (!explorePosts.has(id)) { blockEvent(event); return; }
    selectedExplorePost = id;
    saveSearchSession();
  }, true);
  window.addEventListener('wheel', event => {
    if (isSearchViewer() && Math.abs(event.deltaY) > Math.abs(event.deltaX) && !insidePostScroller(event.target)) blockEvent(event);
  }, { capture: true, passive: false });
  window.addEventListener('keydown', event => {
    if (!isSearchViewer() || event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    if (['ArrowDown','ArrowUp','PageDown','PageUp',' ','Home','End'].includes(event.key) && !insidePostScroller(event.target)) blockEvent(event);
  }, true);

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-still-ui]')) return;
    const horizontal = target.closest('[data-still-no-horizontal],button,[role="button"],a');
    if ((isPostPage() || currentRoute === 'reels' || currentRoute === 'explore' || mediaDialog()) && horizontal && (horizontal.hasAttribute('data-still-no-horizontal') || outerPostControl(horizontal))) { blockEvent(event); return; }
    if (quietReason && target.closest('main,[role="main"],[data-still-quiet-content]')) { blockEvent(event); return; }
    // Carousel advances: backtracking does not grant another seven items.
    const button = target.closest('button, [role="button"]');
    if (!button) return;
    const label = `${button.getAttribute('aria-label') || ''} ${button.querySelector('svg')?.getAttribute('aria-label') || ''}`.trim();
    if (quietReason && /^(navigate to (?:next|previous) reel|next|previous|go back)(\s|$)/i.test(label)) {
      blockEvent(event);
      return;
    }
    if (isSearchViewer() && /^(?:next|previous|down|up|next reel|next video|navigate to (?:next|previous) reel)(?:\s|$)/i.test(label) && !isPostPage()) { blockEvent(event); return; }
    if (currentRoute === 'reels' && state.batches.reels.seen.length >= Core.LIMITS.reels && /^(next|down|next reel|next video|navigate to next reel)(\s|$)/i.test(label) && [...boundaries].some(([container, max]) => container.scrollTop >= max - 2)) {
      blockEvent(event);
      return;
    }
    const slideNumber = label.match(/^Go to slide (\d+)/i);
    if (slideNumber) {
      const article = button.closest('article, [role="article"], [role="dialog"]');
      if (!article) return;
      const position = Number(slideNumber[1]);
      if (position > Core.LIMITS.carousel) {
        blockEvent(event);
      } else {
        carousels.set(article, position);
        const id = postId(article);
        if (id) carouselPositions.set(id, position);
      }
      return;
    }
    const next = /^(next|next slide|next photo|next image)(\s|$)/i.test(label);
    const previous = /^(previous|back|go back|previous slide)(\s|$)/i.test(label);
    if (!next && !previous) return;
    const article = button.closest('article, [role="article"]') || button.closest('[role="dialog"]');
    if (!article) return;
    // The reel viewer has its own batch counter, not a carousel counter.
    if (currentRoute === 'reels' && !article.querySelector('img')) return;
    const id = postId(article);
    const position = id ? carouselPositions.get(id) || 1 : carousels.get(article) || 1;
    if (next && position >= Core.LIMITS.carousel) {
      blockEvent(event);
      return;
    }
    const updated = Math.max(1, position + (next ? 1 : -1));
    carousels.set(article, updated);
    if (id) carouselPositions.set(id, updated);
  }, true);

  let touchStart = null;
  document.addEventListener('touchstart', event => {
    const article = event.target.closest?.('article, [role="article"], [role="dialog"]') || (isPostPage() ? document.body : null);
    touchStart = article && event.touches.length === 1 ? { article, x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', event => {
    if (!touchStart || !event.touches[0]) return;
    const dx = touchStart.x - event.touches[0].clientX;
    const dy = touchStart.y - event.touches[0].clientY;
    if (isSearchViewer() && Math.abs(dy) > Math.abs(dx) && !insidePostScroller(event.target)) { blockEvent(event); return; }
    const id = postId(touchStart.article);
    const position = (id && carouselPositions.get(id)) || carousels.get(touchStart.article) || 1;
    if (dx > 10 && Math.abs(dx) > Math.abs(dy) && position >= Core.LIMITS.carousel) blockEvent(event);
  }, { capture: true, passive: false });

  // Catch native viewer shortcuts before Instagram's window/document handlers.
  window.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    const dialog = mediaDialog();
    if (currentRoute !== 'reels' && !isPostPage() && !dialog) return;
    blockEvent(event);
    if ((!isPostPage() && !dialog) || quietReason) return;
    // Explicitly advance only the current post's inner carousel. Never let the
    // same key fall through to Instagram's previous/next-post shortcut.
    const focused = document.activeElement?.closest('article,[role="article"]');
    const articles = [...document.querySelectorAll('article,[role="article"]')].filter(article => visible(article));
    const article = focused || articles.find(article => article.closest('[role="dialog"]')) || articles[0];
    if (!hasPhotoCarousel(article)) return;
    const pattern = event.key === 'ArrowRight' ? /^(?:next|next slide|next photo|next image)(?:\s|$)/i : /^(?:previous|go back|back|previous slide|previous photo|previous image)(?:\s|$)/i;
    const control = [...article.querySelectorAll('button,[role="button"]')].find(button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.querySelector('svg')?.getAttribute('aria-label') || ''}`.trim();
      return pattern.test(label) && !outerPostControl(button) && visible(button) && !button.disabled && getComputedStyle(button).display !== 'none';
    });
    control?.click();
  }, true);

  document.addEventListener('keydown', event => {
    const editable = event.target.matches?.('input,textarea,select,[contenteditable="true"]');
    if (quietReason && event.target.closest?.('main,[role="main"]') && ['ArrowDown', 'ArrowUp', 'ArrowRight', 'PageDown', 'PageUp', ' ', 'End', 'Tab'].includes(event.key)) blockEvent(event);
    if (!quietReason && !editable && ['ArrowDown', 'PageDown', ' ', 'End'].includes(event.key) && !event.shiftKey) {
      const container = scrollContainer(event.target);
      const max = boundaries.get(container);
      if (max !== undefined && (event.key === 'End' || container.scrollTop >= max - 2)) {
        blockEvent(event);
        if (event.key === 'End') container.scrollTop = max;
        return;
      }
    }

  }, true);
  document.addEventListener('wheel', event => {
    if (quietReason) { blockEvent(event); return; }
    if (event.deltaY <= 0) return;
    const container = scrollContainer(event.target);
    const max = boundaries.get(container);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (max !== undefined && container.scrollTop + delta > max) {
      blockEvent(event);
      container.scrollTop = max;
    }
  }, { capture: true, passive: false });
  document.addEventListener('touchmove', event => { if (quietReason) blockEvent(event); }, { capture: true, passive: false });
  document.addEventListener('play', event => { if (quietReason && event.target instanceof HTMLMediaElement) event.target.pause(); }, true);
  document.addEventListener('scroll', event => {
    const container = event.target === document ? document.scrollingElement : event.target;
    if (clampScroll(container)) event.stopImmediatePropagation();
    if (currentRoute === 'explore') checkExplore(event.target);
    schedule();
  }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { applyAccess(); schedule(); });
  window.addEventListener('popstate', schedule);
  const observer = new MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('[data-still-ui]'))) schedule();
  });
  observer.observe(document, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.still) return;
    const oldState = state;
    state = Core.normalize(changes.still.newValue);
    const feature = currentRoute;
    if (state.batches[feature] && oldState.batches[feature]?.generation !== state.batches[feature].generation) {
      // Reload removes old virtualization state and gives each fresh batch a clean start.
      location.reload();
      return;
    }
    applyAccess();
    schedule();
  });
  // Share only media identity and DOM elements with the local dashboard tracker.
  function statsArea(element) {
    const r=element.getBoundingClientRect();
    return Math.max(0,Math.min(r.right,innerWidth)-Math.max(0,r.left))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(0,r.top));
  }
  globalThis.FiniteScrollCandidates = () => {
    if (!ready || quietReason || currentRoute === 'stories') return [];
    const dialog = mediaDialog();
    const routeId = location.pathname.match(/\/(?:p|reels?)\/([^/?#]+)/)?.[1];
    const root = dialog || document;
    if (currentRoute === 'reels') {
      return [...root.querySelectorAll('video')].sort((a,b)=>statsArea(b)-statsArea(a)).slice(0,1).map(element => ({kind:'reels',id:routeId || postId(element.closest('article,[role="article"]') || element.parentElement),element})).filter(item=>item.id);
    }
    if (dialog || isPostPage()) {
      const scope = dialog || document.querySelector('article,[role="article"]');
      const element = scope && [...scope.querySelectorAll('img,video')].sort((a,b)=>statsArea(b)-statsArea(a))[0];
      const id = routeId || (scope && postId(scope));
      return element && id ? [{kind:'posts',id,element}] : [];
    }
    if (currentRoute !== 'home') return [];
    return [...document.querySelectorAll('article,[role="article"]')].map(article => {
      const element = [...article.querySelectorAll('img,video')].sort((a,b)=>statsArea(b)-statsArea(a))[0];
      return {kind:'posts',id:postId(article),element};
    }).filter(item=>item.id && item.element);
  };
  applyAccess();
  void send({ type: 'GET_STATE' }).then(result => {
    if (!result) return;
    ready = true;
    applyAccess();
    schedule();
  });
  setInterval(() => {
    if ([state.more,...Core.FEATURES.map(key=>state.navigation[key])].some(wait=>wait.readyAt && Date.now()>=wait.readyAt)) void send({type:'GET_STATE'});
    handleRoute(); applyAccess(); schedule();
  }, 500);
})();
