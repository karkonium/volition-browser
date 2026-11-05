# Finite Scroll 1.13.0

A local Chrome / Microsoft Edge extension that gives Instagram, YouTube, and LinkedIn feeds an ending. No redirect, replacement page, or full-screen stopping UI.

## Instagram

The Instagram popup has four controls:

- **Show Reels:** start a wait, then click the ready button to reveal Instagram's Reels navigation for 30 seconds.
- **Show Search:** independently wait, then click to reveal Search/Explore navigation for 30 seconds.
- **More Reels:** after ten unique Reels, wait and then click the ready button to unlock the next ten. Finishing the wait does not reset the batch until you click.
- **Block login:** signs out Instagram and blocks login until **Turn off** is pressed. It remains immediate; it has no attention wait.

Each of the three feed buttons has its own wait sequence: **10 seconds, 30 seconds, 1 minute, 2 minutes, 4 minutes**, then doubling (capped at 24 hours). Each escalation resets 24 hours after that button's first request. Countdown buttons fill from left to right. A completed wait stays ready across popup closure, page refresh, and browser restart until explicitly clicked; ready credits cannot be stacked or used twice. Reveals cannot be extended while active. Only navigation visibility expires after thirty seconds; an open video, Search view, or social dialog never closes because that timer elapsed.

The first ten Reels need no More Reels wait. The small top-right on-page counter displays **X / 10**. The tenth Reel remains visible, its down arrow disappears, and previous admitted Reels remain accessible. Home-opened modal Reels count even when feed articles remain behind them. Claiming a ready More Reels button clears the batch once and refreshes active Reel viewers. Readiness alone never reloads a viewer or clears consumption. Existing batches and old pending More Reels waits migrate without resetting what you have watched. No reset button bypasses waiting.

Home admits ten recognized posts per page visit. Search/Explore freezes the **first nonempty rendered batch of post tiles**, hides every later addition, and permits natural scrolling through that original set. Opening a result pins its post/Reel viewer: wheel, touch, keyboard and next controls cannot start a further feed. Comments retain their own scrolling and the inner photo carousel stays usable. Returning to Search keeps the original snapshot. Per-tab session storage retains the initial post IDs and selected result through viewer navigation and refresh; leaving for Home/profile clears that snapshot. It does not reuse the former 36-item allowance or share a persisted scroll budget. Follower/following list search boxes are separate from the main Search drawer and stay usable.

Native inner photo carousel arrows, dots, and horizontal gestures work, with the existing seven-item carousel limit. Outer next/previous-post arrows stay hidden on post/Explore views. Home, Stories, profile lists, comments, and Messages remain available.

## YouTube

YouTube Home recommendations and watch-page recommendations are **hidden by default**. **Start wait** begins a wait of **10 seconds, 30 seconds, 1 minute, 2 minutes, 4 minutes**, then doubling (capped at 24 hours). During the wait the disabled button says **Wait Xs** and fills from left to right in green. Completion unlocks **Show for 1m**, which stays available until clicked, including across popup closure, browser restart, and midnight. Recommendations remain hidden until that click starts the shared one-minute reveal. Each wait grants one reveal; ready credits cannot be stacked or used twice. The escalation resets at **local midnight**, independently of Instagram’s rolling 24-hour policy. Closing the popup or restarting cannot extend a minute that has already been started. Playback continues when the minute ends.

When revealed, Home keeps twenty recognized regular videos and watch pages keep the first five regular recommendations. Search/channel/subscription feeds still end at twenty items; watch comments end at ten top-level threads in the selected Top comments or Newest first order. Use YouTube’s native Sort by menu to switch; each new sort gets its own first ten comments. Replies inside admitted threads stay usable. Hiding recommendations never pauses or hides the current player, comments, or playlist queue.

Shorts are removed from the sidebar and from Home/watch recommendations. They remain visible in Search, where clicking a Short opens the **ordinary video URL `/watch?v=VIDEO_ID`**, rather than the vertical Shorts feed. Direct `/shorts/VIDEO_ID` URLs also redirect to that watch page. The normal YouTube watch URL is used instead of the legacy `/v/` path.

Watch pages default to native theatre mode. The Default view / Theatre toggle, in-player Next/Previous controls, suggested-video cards, and end-screen video links stay hidden; Shift+N/Shift+P cannot skip videos. Playback controls and playlist links remain usable. The existing YouTube batch-reload button refreshes only the last active YouTube tab and does not grant recommendation access.

## LinkedIn

Home (`/feed/`) is **empty by default**. In the LinkedIn popup, **Show 5m** reveals at most **10 unique posts for five minutes**. The same allowance survives refreshes, route changes and other tabs; additional posts do not become visible. The button becomes **Hide** while active. At expiry the feed becomes empty again, without redirecting or locking scrolling.

My Network recommendations are **hidden by default**. **Show 5m** reveals only **three individual recommendation cards for five minutes**. Additional cards and discovery dialogs cannot expand that allowance. Invitations, network management links and native Connect controls stay usable. Profiles, messaging, jobs and the connection directory remain outside these limits.

Both controls use the same green buttons as Instagram and YouTube. Unlocks start only when clicked and cannot be extended while active. The dashboard records local LinkedIn time and posts actually viewed, with post IDs hashed before storage. Instagram and YouTube settings and waits remain unchanged.

The display uses an allowlist of admitted native cards: new or unrecognized feed renderers remain hidden, rather than leaking past a selector-only limit. These limits control visible content, not every internal LinkedIn network prefetch. New layouts may require selector updates. No connection or invitation controls are clicked on your behalf.

## Install or update

1. Open `edge://extensions` or `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select this project's `extension` directory, or extract `finite-scroll-extension.zip` and select its `finite-scroll-extension` directory.
3. Pin Finite Scroll to the toolbar.

For an existing unpacked installation, click **Reload** on the existing Still card (it becomes Finite Scroll) and refresh already-open Instagram/YouTube/LinkedIn tabs. Confirm version **1.13.0**. Editing local files alone does not replace content scripts already running in browser tabs.

## Privacy and limitations

Runs only on HTTPS Instagram, YouTube, and LinkedIn (bare and `www` hosts). Permissions are `storage` for local state, `alarms` for deadlines, and `cookies` plus `declarativeNetRequestWithHostAccess` for the Instagram-only login block. Background host access is restricted to HTTPS Instagram and its subdomains. No analytics, remote scripts, external fonts, or extension-originated network calls. No passwords or private message contents are read. The login block uses the browser cookies API only for Instagram; cookie values are never saved or sent anywhere.

Instagram Reel identifiers are stored locally to deduplicate usage. Initial Search post identifiers and the selected result also stay in that Instagram tab’s session storage. A stable media URL path is a fallback identifier. Reveal deadlines, requested-wait deadlines, and escalation state also stay locally. Raw YouTube video/comment identifiers used by the feed limiter stay in page memory; the latest tab ID, view category, and counts go into extension session storage. The daily dashboard separately stores short hashed media identifiers for deduplication and daily time totals for up to a month. The recommendation wait count, local calendar day, wait deadline, and reveal deadline are stored locally across browser restarts; No video titles, search queries, comment contents, or raw YouTube watch URLs are persisted.

The extension limits recognized visible content and native navigation. Instagram/YouTube may internally prefetch extra media; this is not a guarantee about network downloads. New site layouts, localized control labels, other blockers, or unrecognized cards can require selector updates. Explore's finite display hides recognized overflow and loading indicators; it does not intercept every internal API request. Other extensions retain their own independent settings.

## Validation

Version 1.5.0 checks use the actual extension in isolated Chromium with controlled site fixtures:

- Ten core policy checks cover thirty-second visibility, ten-Reel consumption, wait escalation, serialized restart, exact-once renewal, stale generations, 24-hour reset, bypass prevention, and migration from older versions.
- Nine Instagram browser checks cover exactly three popup controls, reveal expiry without a content takeover, Home limits, follower/following dialogs, inner carousel versus outer post controls, naturally scrolling finite Search, Home-opened modal Reels, ten-Reel navigation, and a real ten-second countdown continuing with the popup closed.
- Eleven YouTube regression checks cover finite feeds, modern Shorts cards, SPA searches, recommendations/comments, player/playlist preservation, Shorts navigation, popup renewal, and Instagram state isolation.

**Live Edge verification on October 24, 2026:** reloaded the enabled extension and confirmed version 1.5.0. The popup displayed exactly Show Reels, Show Search, and More Reels. Show actions revealed navigation, which disappeared after the thirty-second window without closing the current page. A real photo carousel advanced to `img_index=2` and exposed Back; both Followers and Following opened, follower search accepted typing, and both lists remained usable. Explore scrolled to Instagram’s native footer; repeated downward scrolling did not extend the finite grid. Existing usage migrated into the ten-Reel batch. Live scrolling reached 10 / 10, hid Down, and further wheel/down-key input stayed on the tenth Reel. More Reels displayed a 10-second countdown; with the popup closed, completion renewed the live viewer to 1 / 10 and restored Down. Instagram was returned to Home with Reels/Search navigation hidden. Longer waits and the 24-hour reset were verified through automated policy checks, not real-time live waits.

## Development

The extension has no runtime dependencies. Tests require Node.js, Playwright and Chromium; packaging requires Python 3.

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
npm run test:usage
npm run test:login
npm run test:linkedin
npm run test:youtube
npm run package
```

`extension/core.js` owns Instagram policy; `background.js` serializes persistent updates and settles waits; `content.js`/`content.css` control Instagram's native content; `youtube.js`/`youtube.css` handle YouTube; `popup.*` provides the toolbar UI. `tests/` contains policy and real-extension browser checks; `preview/` contains generated screenshots.

1.5.2 refines outer post-arrow detection for layouts that nest those controls inside the same article as the photo carousel. Carousel controls over the media remain usable; outer Next/Previous controls are hidden and click-blocked. Includes the 1.5.1 top-right counter positioning change. Reload and refresh are required to activate these edits.

1.5.3 captures keyboard Left/Right before Instagram’s viewer shortcuts. These keys cannot switch posts or Reels. Within a photo post they operate only its current inner carousel; typing/cursor movement in editable fields stays native. Keyboard interception is covered against window-level navigation handlers in the browser fixtures.

1.5.4 fixes Search-to-post scrolling by retaining the initial Search snapshot across post/modal/Reel viewer navigation, refreshing the viewer, and returning to the grid. Regression fixtures cover later additions below the old limit, wheel/keyboard feed switching, comments and inner carousel access, and vertical Reel-viewer controls. Live 1.5.4 activation and verification are recorded below.

**Live Edge verification for 1.5.4 on October 24, 2026:** reloaded the enabled extension card from 1.5.3 to 1.5.4 and refreshed Instagram. Search retained its first rendered results after repeated downward scrolling and reached the native footer. Opening a result, wheel scrolling, Down, and Right stayed on that same post. A refreshed post also stayed pinned under further wheel/Down input. In a fresh normal Search visit, opening a result and closing it with Escape returned to the initial grid; repeated scrolling showed no new post IDs and ended at the footer. Instagram was returned to Home. Comments/carousel preservation and a result opened in the vertical Reel viewer were covered by the automated fixtures.

If Instagram replaces the grid with entirely different recommendations after a full post refresh and browser Back, the saved allowlist still rejects those replacements; the returned Search grid can be empty. Leaving for Home and opening Search again starts a fresh initial batch. The normal modal close-and-return flow retained its initial grid in the live check.

1.5.5 limits watch-page recommendations to five and top-level comments to fifteen, with matching popup counts. Comment identity uses the individual comment permalink rather than the shared video ID. Thirteen YouTube browser checks pass, including exact first-item retention, realistic comment links, late overflow additions, and unchanged player/playlist behavior. Live activation of 1.5.5 is recorded below.

**Live Edge verification for 1.5.5 on October 25, 2026:** reloaded Still and confirmed the enabled card shows 1.5.5, then refreshed a real YouTube watch page. The popup reported recommendations 5 / 5 and comments 15 / 15. Native accessibility content independently contained five recommendation headings and fifteen distinct comment permalinks. Repeated downward scrolling kept both counts unchanged. The video continued playing and the page was returned to the player.

1.5.6 adds default native theatre mode on each watch navigation and removes in-player video-switching controls, cards, and end-screen links. Fifteen YouTube browser checks pass, including theatre entry, respecting manual view changes, resetting the default for the next video, hidden/blocked player navigation, and preserved playback, five recommendations, and fifteen comments. Live activation is recorded below.

**Live Edge verification for 1.5.6 on October 25, 2026:** reloaded the enabled Still card and confirmed version 1.5.6. After refreshing a real YouTube watch page, the native view button read Default view and a screenshot confirmed the wide theatre layout. The in-player Next/Previous and Show cards controls were absent. Video playback continued. Manual view changes remain permitted by design. Suggested-card/end-screen click blocking and skip-key protection were verified by the automated browser fixtures rather than seeking the live video to its end.

1.5.7 hides the native `.ytp-size-button` (Default view / Theatre mode) while preserving automatic theatre initialization. Other playback controls remain available. The YouTube browser checks confirm the button is hidden and theatre entry still succeeds. Reload Still and refresh YouTube to activate.

**Live Edge verification for 1.5.7 on October 25, 2026:** confirmed the enabled extension card shows 1.5.7 and refreshed YouTube. Neither Default view nor Theatre mode appeared in the player’s accessibility controls; the screenshot retained the wide theatre layout and playback continued.

## Current 1.6.0 validation

All 49 automated checks pass: ten Instagram policy checks, five YouTube recommendation-access policy checks, fourteen Instagram browser checks, and twenty YouTube browser checks. New coverage includes hidden-by-default Home/watch recommendations, a real ten-second countdown with the popup closed, one-minute deadline math, no stockpiling, restart and local-midnight behavior, shared deadlines across tabs, expiry without interrupting the player/comments/playlists, hidden sidebar/recommended Shorts, Search Shorts opening as regular videos despite bound SPA handlers, direct Shorts URL conversion, and batch reload preserving the lock. The updated popup was rendered and visually inspected. Live 1.6.0 activation is pending.

1.6.1 fixes profile-opened Reel viewers that retain a profile URL or use `/username/reel/ID/`. Horizontal post buttons are hidden/click-blocked, and Left/Right shortcuts cannot switch Reels there. Video controls are no longer mistaken for an inner photo carousel; actual photo carousels, comment cursor movement, follower lists, and Story navigation remain available. Ten core checks and seventeen Instagram browser checks pass, including both profile viewer layouts and Story exclusion. Reload Still and refresh Instagram to activate this version.


## 1.7.0 — Finite Scroll and the daily dashboard

Still is now **Finite Scroll**. The popup removes the large introduction, uses the same green action buttons for both sites, and shows today's active time plus YouTube videos, Instagram Reels, and Instagram posts viewed. Existing access settings, batches, waits, and the extension ID are preserved; the internal legacy storage names remain for compatibility.

Tracking begins after this update is loaded and site tabs are refreshed. A visible, focused tab counts time during interaction (60-second idle cutoff) or visible video playback. YouTube videos count after five seconds of visible playback, Reels after two seconds, and posts after one second with at least half their media in view. Each item counts once per local calendar day, across tabs and reloads. These are estimates of views, not completed watches. Background tabs and prefetched feed cards do not count. Daily totals reset at local midnight. A month of aggregates and short hashed media identifiers stay in local extension storage; no URLs, titles, account names, or analytics are sent anywhere. No new permissions are required.

Reload the existing extension card, then refresh Instagram and YouTube. Do not remove/reinstall it, which would erase saved state. This update has automated fixture coverage; it has not yet been activated or checked on the signed-in Edge tabs.

Validation for 1.7.0 includes 18 policy/metrics checks, 17 Instagram browser checks, 20 YouTube browser checks, and six dashboard browser checks. Dashboard checks exercise visible playback, daily deduplication across reloads, paused/background exclusion, visible versus off-screen Instagram posts, profile Reels, displayed totals, matching button colors, and popup height. Browser tests use isolated Chromium fixtures, not the signed-in Edge session.

1.7.1 lowers the Instagram Home limit to 15 posts per page visit and updates the popup. Reload the existing extension and refresh Instagram to activate.


## 1.8.0 — Matching controls and Instagram login block

Instagram Home now stops at 10 posts. All feed/login action rows share the same component and 112 × 36 green button, including YouTube's recommendation reveal and batch reset.

**Block login** defaults off. Turning it on clears Instagram cookies (including HttpOnly and partitioned cookies) and refreshes open Instagram tabs. A persistent browser network rule strips outgoing Cookie and incoming Set-Cookie headers for Instagram domains, preventing a durable sign-in even through another sign-in provider. Script-created Instagram cookies are also removed while blocked. Other domains, including Google and YouTube, are outside the rule and host permission. **Turn off** removes the rules and refreshes Instagram; it does not restore deleted sessions, so signing in again is necessary. This is a reversible self-control feature, not a security boundary against disabling the extension or using another browser/profile. It does not delete your account or saved passwords. Cookie consent/preferences may need to be chosen again after allowing login.

Implementation follows the official [Chrome cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies) and [declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest). Login-block verification uses a real local HTTPS server and disposable Chromium profile, with tests for session removal, partitioned cookies, blocked network login responses, new script-created cookies, persistence across a full restart, Google-cookie preservation, and normal sign-in after disabling. No real signed-in accounts are used or signed out during tests. The live Edge extension still needs a manual reload and may request the new Instagram cookie/site permissions. Login blocking remains off until its button is pressed.

Validation for 1.8.0: all 67 checks pass (18 policy/metrics, 17 Instagram browser, 20 YouTube browser, six dashboard browser, six login/controls browser checks). Both popup layouts were visually inspected.

1.8.1 replaces the large YouTube limits card with a small note below its controls, leaving the dashboard as the only prominent numeric display. Limits and tracking behavior are unchanged.


## 1.8.2 — Explicit persistent Instagram login block

The login control now says **Block IG login — Off / Turn on** or **On / Turn off**. It stays disabled while checking its initial state, avoiding an initial action label that can change under the pointer. Completion messages explicitly say Blocking ON or Blocking OFF. Turning ON clears Instagram sessions and opens Instagram’s own sign-in page rather than reloading a potentially cached profile. Native login submits/buttons and Instagram login POST endpoints are blocked in addition to cookie isolation. No replacement page or overlay is introduced. The saved ON intent repairs missing browser rules and persists across restarts until explicitly turned off. Permission checks report missing Instagram cookie/site access instead of reporting an effective block.

Browser tests verify native form blocking, browser-level rejection of Instagram's actual login-endpoint URL, HTTP-only and partitioned cookie removal, persistence across a full restart, repair after network rules are lost, explicit on/off labels, and Google-cookie preservation. These use a disposable browser profile; real account credentials are never entered. The signed-in Edge popup could not be read because native control timed out; live activation and verification are still pending.


## 1.9.0 — Wait first, reveal when ready

A completed YouTube wait now saves one ready reveal rather than starting its minute automatically. Click **Show for 1m** when you return; only that click starts the minute. The disabled countdown button itself fills left to right, with contrasting text over both the gray remaining area and green completed area. Progress uses a saved start time and deadline, so reopening the popup and crossing midnight keep the correct fill. The extension badge says Ready after completion. Earlier pending waits migrate into this ready state; previously started minutes retain their deadline. No new permissions are required. Reload the extension to activate.

Validation for 1.9.0: all 20 policy/metrics checks and 21 YouTube browser checks pass. The progress and ready states were rendered and visually inspected; browser checks include a real ten-second wait while closing the popup, hidden recommendations at completion, a ready button retained through reopening, and a reveal deadline measured from the explicit click. Live Edge activation remains pending.


## 1.9.1 — Ten Top comments or ten Newest first

YouTube comments now stop at 10 top-level comments in either native sort. Switching **Sort by → Newest first** or back to **Top comments** admits the first ten of the newly sorted response, without charging it against the previous sort’s used allowance. The old comment DOM is retained while the new response loads, and the budget resets only when the sorted batch arrives. Late additional top-level comments stay hidden. Replies and reply continuations inside admitted threads remain available. The popup status and small limits note both show the new ten-comment limit. Reload the extension and refresh YouTube to activate.


## 1.10.0 — Instagram wait-then-click buttons

Show Reels, Show Search, and More Reels now use the same left-to-right filling countdown control as YouTube. Each button has an independent rolling-24-hour escalation and a ready state that persists until clicked. Show Reels/Search start their existing thirty-second navigation reveal only on that final click. More Reels renews its batch only on that final click. Old pending More Reels waits migrate into readiness, preserving the consumed batch. The login toggle stays immediate. No permissions are added. Reload the extension and refresh Instagram to load the updated policy and UI.

Validation for 1.10.0: 19 policy/metrics checks, 17 Instagram browser checks, 24 YouTube browser checks, eight login/controls browser checks, and six dashboard browser checks pass. Instagram browser coverage uses real ten-second waits for navigation and More Reels, popup closure during waiting, left-to-right progress, persistent readiness, and explicit final-click activation. The three Instagram countdown/ready states were rendered and visually inspected. Live Edge activation is pending.


## 1.11.0 — LinkedIn Home and My Network

Adds LinkedIn content-script access, a matching popup tab, and local time/post metrics. Home ends at 10 unique posts; My Network ends after its initial recommendations. Native discovery dialogs are finite too. Initial Network snapshots survive replacement of the main element, while other native routes stay usable. The Instagram login block and all existing Instagram/YouTube waits remain unchanged. Existing daily metric records migrate without resetting previous totals.

LinkedIn adds read/change access only for `https://linkedin.com/*` and `https://www.linkedin.com/*`; it adds no cookie or background host access for LinkedIn. Reload the existing extension and refresh LinkedIn to activate. Edge/Chrome may ask to approve the additional site. The LinkedIn behavior is tested in disposable Chromium using classic and modern fixtures; the signed-in live site has not been activated or verified.

Validation for 1.11.0: all 90 checks pass (20 policy/metrics, 17 Instagram browser, 24 YouTube browser, eight login/controls browser, six dashboard browser, and 15 LinkedIn browser checks). LinkedIn coverage includes classic/modern markup, delayed initial results, late additions, main-element replacement, native discovery dialogs, ordinary scrolling, native controls, excluded routes, local metrics, popup layout, manual renewal, and isolation from Instagram/YouTube state. The LinkedIn popup was rendered and visually inspected.

## 1.12.0 — LinkedIn defaults and timed unlocks

Replaces the per-visit Home limit and Network snapshots with default-hidden controls. Home grants ten posts for five minutes; My Network grants one person for thirty seconds. The persisted, shared quota prevents reloads, extra tabs and discovery dialogs from opening another batch during the same grant. Hidden video playback is paused. No wheel interception, scroll clamping, redirects or on-page stopping UI is used.

Reload the extension at `edge://extensions` (or `chrome://extensions`) and refresh LinkedIn. This update adds no site permissions beyond 1.11.0. Validation uses disposable Chromium fixtures; the live signed-in Edge site has not been verified for this version.

Validation for 1.12.0: all 94 checks pass (25 policy/metrics, 17 Instagram browser, 24 YouTube browser, eight login browser, six usage browser, 14 LinkedIn browser). LinkedIn covers default-hidden surfaces, explicit unlocks, expiry, shared quotas across refreshes/tabs/dialogs, modern markup, unknown renderers, recycled identities, native controls and excluded routes, visible-post metrics, stable rendering across animation frames, popup layout, and isolation from IG/YouTube. The popup was rendered and visually inspected.

## 1.12.1 — Current LinkedIn Home routes and SDUI cards

A live Edge inspection identified `/feed/foryou/` as the active Home route. Earlier versions classified it as an unrestricted page. Home feed subroutes now share the default-hidden, ten-post/five-minute policy; `/feed/update/` individual post pages remain native. The current SDUI layout's Primary content column, opaque expanded card keys, lazy wrappers and scroll spacers are supported. Sidebars remain visible. Tests reproduce the previous route leak and cover For You, Following, Network, SPA transitions, opaque keys and oversized scroll spacers. Activation requires reloading the extension and refreshing LinkedIn; inspecting the old live page does not activate this update.

## 1.13.0 — Five-minute LinkedIn unlocks

Home starts empty; Show 5m admits the first ten posts for five minutes. My Network recommendations start hidden; its Show 5m admits the first three individual cards for five minutes. Both close on expiry and share their quota across tabs, refreshes and discovery dialogs. The popup footer shows the loaded version so an older running build is easier to identify. Edge was observed still running 1.12.0, which predates the fix for `/feed/foryou/`; reload the extension and refresh LinkedIn to activate the corrected route handling and new limits.
