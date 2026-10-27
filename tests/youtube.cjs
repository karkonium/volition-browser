const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const output = path.resolve(__dirname, '../preview');
fs.mkdirSync(output,{recursive:true});
const extension = path.resolve(__dirname, '../extension');

function cards(tag, prefix = 'V') {
  return Array.from({length:25}, (_,i) => `<${tag} style="display:block;height:120px"><yt-lockup-view-model style="display:block"><a href="/watch?v=${prefix}${i}">Video ${i+1}</a></yt-lockup-view-model></${tag}>`).join('');
}
function fixture(url) {
  const nav = '<ytd-mini-guide-entry-renderer><a href="/shorts/">Shorts sidebar</a></ytd-mini-guide-entry-renderer><nav style="height:40px"><a href="/">YouTube Home</a><a href="/results?search_query=test">Search</a></nav>';
  const continuation = '<ytd-continuation-item-renderer id="tail" style="display:block;height:300px">More results</ytd-continuation-item-renderer>';
  if (url.pathname.startsWith('/shorts')) {
    const base = Number(url.pathname.match(/S(\d+)/)?.[1] || 1);
    const shorts = Array.from({length:12},(_,i)=>`<ytd-reel-video-renderer video-id="S${base+i}" style="display:block;height:600px;width:400px"><video style="width:400px;height:600px"></video><span>Short ${base+i}</span></ytd-reel-video-renderer>`).join('');
    return `<html><body style="margin:0">${nav}<div id="viewer" style="width:420px;height:600px;overflow:auto">${shorts}</div><button id="prev" aria-label="Previous video">Previous</button><button id="next" aria-label="Next video">Next</button><script>let n=${base};function move(delta){n=Math.max(${base},n+delta);history.pushState({},'', '/shorts/S'+n);document.querySelector('#viewer').scrollTop=(n-${base})*600;document.dispatchEvent(new Event('yt-navigate-finish'))}document.querySelector('#next').onclick=()=>move(1);document.querySelector('#prev').onclick=()=>move(-1);</script></body></html>`;
  }
  if (url.pathname === '/watch') {
    return `<html><body>${nav}<ytd-watch-flexy style="display:block"><main><div id="movie_player"><button id="player" onclick="this.dataset.playing='true'">Play video</button><button class="ytp-size-button" onclick="document.querySelector('ytd-watch-flexy').toggleAttribute('theater')">Theatre mode</button><button class="ytp-next-button" onclick="window.switched=true">Next video</button><button class="ytp-prev-button" onclick="window.switched=true">Previous video</button><a class="ytp-ce-element" href="/watch?v=END">End screen video</a><a class="ytp-videowall-still" href="/watch?v=END2">Video wall</a><button class="ytp-cards-button">Suggested video card</button></div><ytd-playlist-panel-renderer>${Array.from({length:30},(_,i)=>`<div>Playlist item ${i}</div>`).join('')}</ytd-playlist-panel-renderer></main><aside id="related"><ytd-compact-video-renderer id="related-short"><a href="/shorts/HIDDEN">Short recommendation</a></ytd-compact-video-renderer>${cards('ytd-compact-video-renderer','R')}${continuation}</aside><ytd-comments><ytd-sort-filter-sub-menu-renderer><button id="sort-comments">Sort by</button><tp-yt-paper-listbox role="listbox" selected="0"><tp-yt-paper-item id="sort-top" role="option" aria-selected="true">Top comments</tp-yt-paper-item><tp-yt-paper-item id="sort-newest" role="option" aria-selected="false">Newest first</tp-yt-paper-item></tp-yt-paper-listbox></ytd-sort-filter-sub-menu-renderer><div id="comment-list">${Array.from({length:25},(_,i)=>`<ytd-comment-thread-renderer style="display:block;height:80px">Comment ${i+1}<a href="/watch?v=V1&lc=C${i}">Timestamp</a><button>Reply</button></ytd-comment-thread-renderer>`).join('')}</div>${continuation}</ytd-comments></ytd-watch-flexy></body></html>`;
  }
  const search = url.pathname === '/results';
  const root = search ? 'ytd-search' : 'ytd-browse';
  const tag = search ? 'ytd-video-renderer' : 'ytd-rich-item-renderer';
  return `<html><body style="margin:0">${nav}<${root} style="display:block">${search ? '<ytm-shorts-lockup-view-model id="search-short"><a href="/shorts/SEARCH0">Search Short</a></ytm-shorts-lockup-view-model>' : url.pathname === '/' ? '<ytd-rich-item-renderer id="home-short"><a href="/shorts/HOME_SHORT">Home Short</a></ytd-rich-item-renderer>' : ''}${cards(tag)}${continuation}</${root}></body></html>`;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'still-youtube-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel:'chromium', headless:true,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
    viewport:{width:1280,height:820}
  });
  let checks=0;
  const pass = message => { checks++; console.log('PASS: '+message); };
  const errors=[];
  context.on('weberror', error => errors.push(error.error().message));
  try {
    await context.route('https://www.youtube.com/**', route => route.fulfill({contentType:'text/html',body:fixture(new URL(route.request().url()))}));
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    const page=await context.newPage();
    const popup=await context.newPage();
    await popup.setViewportSize({width:408,height:850});
    await popup.goto(`chrome-extension://${id}/popup.html`);
    // Wait for popup initialization before snapshotting the unrelated Instagram state.
    await popup.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
    const originalInstagram=await worker.evaluate(async()=> (await chrome.storage.local.get('still')).still);
    const status=()=>worker.evaluate(async()=> (await chrome.storage.session.get('youtubeStatus')).youtubeStatus);
    const noUI=async()=>assert.equal(await page.locator('[data-still-ui], [role="dialog"]').count(),0);

    await page.goto('https://www.youtube.com/');await page.bringToFront();
    await page.waitForFunction(()=>document.querySelectorAll('ytd-rich-item-renderer[data-still-yt-overflow]').length===5);
    assert.equal(await page.locator('ytd-rich-item-renderer:not([data-still-yt-overflow]):not([data-still-yt-shorts-hidden])').count(),20);
    assert.equal(await page.locator('#tail').isVisible(),false);
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.waitForTimeout(150);
    assert.equal(page.url(),'https://www.youtube.com/');
    await noUI();
    pass('Home admits twenty outer cards without double-counting nested modern renderers, then hides continuation');
    assert.equal(await page.locator('ytd-browse').isVisible(),false);
    assert.equal(await page.locator('ytd-mini-guide-entry-renderer').isVisible(),false);
    assert.equal(await page.locator('#home-short').isVisible(),false);
    pass('Home recommendations are hidden by default and Shorts are absent from the sidebar and Home');

    await popup.bringToFront();await popup.locator('#youtube-tab').click();
    await popup.locator('#youtube-recommendations').click();
    await popup.waitForFunction(()=>document.querySelector('#youtube-recommendations .button-label').textContent.startsWith('Wait'));
    assert.equal(await popup.locator('#youtube-recommendations').isEnabled(),false);
    await popup.waitForTimeout(4500);
    const progress=await popup.locator('#youtube-recommendations').evaluate(e=>parseFloat(e.style.getPropertyValue('--wait-progress')));
    assert.ok(progress>20 && progress<90);
    assert.equal(await popup.locator('#youtube-recommendations .button-fill').evaluate(e=>getComputedStyle(e).display),'flex');
    await popup.screenshot({path:path.join(output,'youtube-wait-progress.png'),fullPage:true});
    pass('waiting button is disabled and fills left to right with its persisted countdown progress');
    await popup.goto('about:blank');await page.bringToFront();
    await page.waitForTimeout(6500);
    assert.equal(await page.locator('ytd-browse').isVisible(),false);
    await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#youtube-tab').click();
    await popup.waitForFunction(()=>document.querySelector('#youtube-recommendations .button-label').textContent==='Show for 1m' && !document.querySelector('#youtube-recommendations').disabled);
    let ready=await worker.evaluate(async()=>(await chrome.storage.local.get('youtubeAccess')).youtubeAccess);
    assert.equal(ready.ready,true);assert.equal(ready.until,0);
    await popup.screenshot({path:path.join(output,'youtube-ready.png'),fullPage:true});
    // A completed wait can be claimed much later, including after reopening the popup.
    await popup.goto('about:blank');await page.waitForTimeout(1000);
    await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#youtube-tab').click();
    await popup.waitForFunction(()=>document.querySelector('#youtube-recommendations .button-label').textContent==='Show for 1m');
    const clickedAt=Date.now();await popup.locator('#youtube-recommendations').click();
    await page.waitForFunction(()=>document.documentElement.dataset.stillYtRecommendations==='open');
    ready=await worker.evaluate(async()=>(await chrome.storage.local.get('youtubeAccess')).youtubeAccess);
    assert.ok(ready.until>=clickedAt+60000 && ready.until<clickedAt+62000);assert.equal(ready.ready,false);
    assert.equal(await page.locator('ytd-browse').isVisible(),true);
    assert.equal(await page.locator('#home-short').isVisible(),false);
    pass('completed wait stays hidden and ready across popup closure; only clicking starts the shared one-minute reveal');


    await page.evaluate(()=>{
      const card=document.createElement('ytd-rich-item-renderer');card.innerHTML='<a href="/watch?v=LATE">A late video</a>';
      document.querySelector('ytd-browse').append(card);
    });
    await page.waitForFunction(()=>!!document.querySelector('a[href="/watch?v=LATE"]').closest('[data-still-yt-overflow]'));
    pass('late infinite-scroll additions are hidden after the finite batch');

    await page.goto('https://www.youtube.com/results?search_query=test');await page.bringToFront();
    await page.waitForFunction(()=>document.querySelectorAll('ytd-video-renderer[data-still-yt-overflow]').length===6);
    assert.equal(await page.locator('#tail').isVisible(),false);
    await noUI();
    pass('Search results stop after twenty items without a replacement screen');
    await page.waitForFunction(()=>document.querySelector('#search-short a').href.includes('/watch?v=SEARCH0'));
    assert.equal(await page.locator('#search-short').isVisible(),true);
    await page.locator('#search-short a').evaluate(node=>node.addEventListener('click',event=>{event.preventDefault();history.pushState({},'', '/shorts/WRONG') }));
    await page.locator('#search-short a').click();await page.waitForURL('**/watch?v=SEARCH0');
    pass('Search Shorts stay visible and open normal watch URLs instead of YouTube’s Shorts endpoint');
    await page.goBack();await page.waitForURL('**/results?search_query=test');await page.bringToFront();


    await page.evaluate(()=>{
      const shelf=document.createElement('div');
      shelf.innerHTML='<ytm-shorts-lockup-view-model><a href="/shorts/EXTRA">Extra Short</a></ytm-shorts-lockup-view-model><yt-shorts-lockup-view-model><a href="/shorts/EXTRA2">Extra Short</a></yt-shorts-lockup-view-model>';
      document.querySelector('ytd-search').append(shelf);
    });
    await page.waitForFunction(()=>document.querySelectorAll('ytm-shorts-lockup-view-model[data-still-yt-overflow],yt-shorts-lockup-view-model[data-still-yt-overflow]').length===2);
    pass('modern Shorts cards in search share the twenty-item budget');

    await page.evaluate(()=>{
      history.pushState({},'', '/results?search_query=another');
      document.querySelector('ytd-search').innerHTML=Array.from({length:25},(_,i)=>'<ytd-video-renderer><a href="/watch?v=NEW'+i+'">New result '+i+'</a></ytd-video-renderer>').join('');
      document.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await page.waitForFunction(()=>document.querySelectorAll('ytd-video-renderer:not([data-still-yt-overflow])').length===20);
    pass('a new search query receives a fresh batch after SPA navigation');

    await page.goto('https://www.youtube.com/@sample/videos');await page.bringToFront();
    await page.waitForFunction(()=>document.querySelectorAll('[data-still-yt-overflow]').length===5);
    pass('channel feeds receive the same finite twenty-item boundary');

    await page.goto('https://www.youtube.com/feed/subscriptions');await page.bringToFront();
    await page.waitForFunction(()=>document.querySelectorAll('[data-still-yt-overflow]').length===5);
    pass('subscriptions receive a finite batch');

    await page.goto('https://www.youtube.com/watch?v=V1');await page.bringToFront();
    await page.waitForFunction(()=>document.querySelectorAll('#related [data-still-yt-overflow]').length===20);
    await page.waitForFunction(()=>document.querySelectorAll('ytd-comments [data-still-yt-overflow]').length===15);
    assert.equal(await page.locator('#related ytd-compact-video-renderer:not([data-still-yt-overflow]):not([data-still-yt-shorts-hidden])').count(),5);
    assert.equal(await page.locator('ytd-comments ytd-comment-thread-renderer:not([data-still-yt-overflow])').count(),10);
    assert.deepEqual(await page.locator('ytd-comments ytd-comment-thread-renderer:not([data-still-yt-overflow]) a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('lc'))),Array.from({length:10},(_,i)=>`C${i}`));
    assert.deepEqual(await page.locator('#related ytd-compact-video-renderer:not([data-still-yt-overflow]):not([data-still-yt-shorts-hidden]) a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('v'))),['R0','R1','R2','R3','R4']);
    await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('theater'));
    for (const selector of ['.ytp-size-button','.ytp-next-button','.ytp-prev-button','.ytp-ce-element','.ytp-videowall-still','.ytp-cards-button']) assert.equal(await page.locator(selector).isVisible(),false);
    await page.locator('.ytp-next-button').evaluate(node=>node.click());
    await page.evaluate(()=>window.addEventListener('keydown',e=>{if(e.shiftKey&&['n','p'].includes(e.key.toLowerCase()))window.switched=true}));
    await page.keyboard.press('Shift+N');await page.keyboard.press('Shift+P');
    assert.equal(await page.evaluate(()=>!!window.switched),false);
    pass('watch pages open in native theatre mode and in-player next/previous/cards/end-screen navigation is hidden and blocked');
    await page.locator('.ytp-size-button').evaluate(button=>button.click());await page.waitForTimeout(650);
    assert.equal(await page.locator('ytd-watch-flexy').evaluate(node=>node.hasAttribute('theater')),false);
    await page.evaluate(()=>{history.pushState({},'', '/watch?v=NEXT_WATCH');document.dispatchEvent(new Event('yt-navigate-finish'))});
    await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('theater'));
    pass('the view toggle is hidden while theatre initialization still works; external view changes are respected until the next video');
    await page.locator('#player').click();
    assert.equal(await page.locator('#player').getAttribute('data-playing'),'true');
    assert.equal(await page.locator('ytd-playlist-panel-renderer>div').count(),30);
    assert.equal(await page.locator('ytd-playlist-panel-renderer [data-still-yt-overflow]').count(),0);
    assert.equal(await page.locator('ytd-comments ytd-continuation-item-renderer').isVisible(),false);
    await noUI();
    pass('watch pages keep the first five recommendations and ten distinct comment threads; player and playlists still work');
    await page.waitForTimeout(150);
    assert.equal((await status()).limit,5);assert.equal((await status()).count,5);assert.equal((await status()).secondary,10);
    await popup.bringToFront();await popup.locator('#youtube-tab').click();
    await popup.waitForFunction(()=>document.querySelector('#youtube-current').textContent==='Video recommendations · 5 / 5');
    assert.equal(await popup.locator('#youtube-detail').textContent(),'Comments: 10 / 10 · player stays available');
    pass('the popup reports the independent five-video and ten-comment limits');
    await page.evaluate(()=>{
      const video=document.createElement('ytd-compact-video-renderer');video.innerHTML='<a href="/watch?v=LATE_RELATED">Later recommendation</a>';document.querySelector('#related').append(video);
      const comment=document.createElement('ytd-comment-thread-renderer');comment.innerHTML='<a href="/watch?v=V1&lc=LATE_COMMENT">Later comment</a>';document.querySelector('ytd-comments').append(comment);
    });
    await page.waitForFunction(()=>document.querySelector('a[href*="LATE_RELATED"]').closest('[data-still-yt-overflow]')&&document.querySelector('a[href*="LATE_COMMENT"]').closest('[data-still-yt-overflow]'));
    pass('later recommendations and comment threads remain hidden after their separate limits');
    await page.bringToFront();
    await page.evaluate(()=>{
      const list=document.querySelector('tp-yt-paper-listbox');
      for(const [id,index,prefix] of [['sort-newest',1,'NEW'],['sort-top',0,'TOP']]){
        document.getElementById(id).onclick=()=>{
          list.setAttribute('selected',String(index));
          list.querySelectorAll('[role="option"]').forEach(option=>option.setAttribute('aria-selected',String(option.id===id)));
          // Retain old comments briefly while YouTube fetches a different sort.
          setTimeout(()=>{
            document.querySelector('#comment-list').innerHTML=Array.from({length:25},(_,i)=>`<ytd-comment-thread-renderer style="display:block;height:80px"><a href="/watch?v=V1&lc=${prefix}${i}">${prefix} comment ${i}</a><button>Reply</button></ytd-comment-thread-renderer>`).join('');
            document.querySelector('ytd-comments>a')?.remove();
            for(const node of document.querySelectorAll('ytd-comments>ytd-comment-thread-renderer'))node.remove();
          },550);
        };
      }
    });
    await page.locator('#sort-comments').click();await page.locator('#sort-newest').click();
    await page.waitForFunction(()=>document.querySelector('#comment-list a')?.getAttribute('href').includes('NEW0') && document.querySelectorAll('#comment-list [data-still-yt-overflow]').length===15);
    assert.deepEqual(await page.locator('#comment-list ytd-comment-thread-renderer:not([data-still-yt-overflow]) a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('lc'))),Array.from({length:10},(_,i)=>`NEW${i}`));
    pass('native Newest first replaces the old budget and shows exactly the first ten newest comments');
    await page.locator('#sort-comments').click();await page.locator('#sort-top').click();
    await page.waitForFunction(()=>document.querySelector('#comment-list a')?.getAttribute('href').includes('TOP0') && document.querySelectorAll('#comment-list [data-still-yt-overflow]').length===15);
    assert.deepEqual(await page.locator('#comment-list ytd-comment-thread-renderer:not([data-still-yt-overflow]) a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('lc'))),Array.from({length:10},(_,i)=>`TOP${i}`));
    // A late continuation still cannot extend the selected sort's ten comments.
    await page.evaluate(()=>{
      const extra=document.createElement('ytd-comment-thread-renderer');extra.innerHTML='<a href="/watch?v=V1&lc=TOP_LATE">Late top comment</a>';document.querySelector('#comment-list').append(extra);
      const replies=document.createElement('ytd-comment-replies-renderer');replies.innerHTML='<button>Show replies</button><ytd-continuation-item-renderer id="reply-tail">More replies</ytd-continuation-item-renderer>';document.querySelector('#comment-list ytd-comment-thread-renderer').append(replies);
    });
    await page.waitForFunction(()=>document.querySelector('a[href*="TOP_LATE"]').closest('[data-still-yt-overflow]'));
    assert.equal(await page.locator('#reply-tail').isVisible(),true);
    assert.equal(await page.locator('ytd-comments>ytd-continuation-item-renderer').isVisible(),false);
    pass('switching back to Top comments gets its own ten-comment set; later top-level comments stop while replies stay usable');
    // Native keyboard/component selection can reuse thread elements instead of replacing them.
    await page.evaluate(()=>{
      document.querySelector('tp-yt-paper-listbox').setAttribute('selected','1');
      document.querySelectorAll('#comment-list ytd-comment-thread-renderer').forEach((thread,i)=>{
        const link=thread.querySelector('a');link.href='/watch?v=V1&lc=REUSED'+i;link.textContent='Newest reused '+i;
      });
    });
    await page.waitForTimeout(700);
    assert.deepEqual(await page.locator('#comment-list ytd-comment-thread-renderer:not([data-still-yt-overflow]) a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('lc'))),Array.from({length:10},(_,i)=>`REUSED${i}`));
    pass('native sort changes without a click also work when YouTube reuses existing comment elements');




    assert.equal(await page.locator('#related-short').isVisible(),false);
    const second=await context.newPage();await second.goto('https://www.youtube.com/');
    await second.waitForFunction(()=>document.documentElement.dataset.stillYtRecommendations==='open');
    assert.equal(await second.locator('ytd-browse').isVisible(),true);
    const access=await worker.evaluate(async()=>(await chrome.storage.local.get('youtubeAccess')).youtubeAccess);
    await worker.evaluate(async access=>chrome.storage.local.set({youtubeAccess:{...access,readyAt:0,until:Date.now()-1}}),access);
    await page.waitForFunction(()=>document.documentElement.dataset.stillYtRecommendations==='closed');
    await second.waitForFunction(()=>document.documentElement.dataset.stillYtRecommendations==='closed');
    assert.equal(await second.locator('ytd-browse').isVisible(),false);await second.close();await page.bringToFront();
    pass('Home and watch tabs share the same reveal and expiry rather than separate extendable timers');

    assert.equal(await page.locator('#related').isVisible(),false);
    assert.equal(await page.locator('#player').isVisible(),true);
    assert.equal(await page.locator('#player').getAttribute('data-playing'),'true');
    pass('expiry hides only watch recommendations, keeping the player, comments, and playlist usable');
    await page.goto('https://www.youtube.com/shorts/S1');await page.bringToFront();
    await page.waitForURL('**/watch?v=S1');
    pass('direct Shorts URLs also leave the vertical feed and open the ordinary video player');
    await popup.bringToFront();await popup.locator('#youtube-tab').click();
    await popup.waitForFunction(()=>document.querySelector('#youtube-current').textContent==='Video recommendations · 5 / 5');
    await popup.waitForFunction(()=>document.querySelector('#youtube-access-detail').textContent.includes('30s'));
    fs.mkdirSync(output,{recursive:true});await popup.screenshot({path:path.join(output,'youtube-popup.png'),fullPage:true});
    await popup.locator('#youtube-reset').click();await page.bringToFront();await page.waitForTimeout(400);
    assert.equal(await page.locator('#related').isVisible(),false);
    pass('batch reload cannot bypass the hidden state or escalating recommendation wait');

    assert.deepEqual(await worker.evaluate(async()=> (await chrome.storage.local.get('still')).still),originalInstagram);
    assert.deepEqual(errors,[]);
    pass('YouTube keeps usage status session-only and leaves Instagram state unchanged');
    console.log(`\n${checks} YouTube browser checks passed; no page JavaScript errors.`);
  } finally {await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
