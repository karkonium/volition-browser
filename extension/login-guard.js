/* Background-only Instagram isolation. No Google/YouTube permissions. */
const InstagramLoginGuard = (() => {
  const COOKIE_RULE = 91001, LOGIN_RULE = 91002;
  const resources=['main_frame','sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','csp_report','media','websocket','webtransport','webbundle','other'];
  const rules=[{
    id:COOKIE_RULE,priority:100,
    action:{type:'modifyHeaders',requestHeaders:[{header:'cookie',operation:'remove'}],responseHeaders:[{header:'set-cookie',operation:'remove'}]},
    condition:{requestDomains:['instagram.com'],resourceTypes:resources}
  },{
    id:LOGIN_RULE,priority:101,action:{type:'block'},
    condition:{requestDomains:['instagram.com'],requestMethods:['post'],
      regexFilter:'^https://([^/]+\\.)?instagram\\.com(:[0-9]+)?/(api/[^?#]*accounts/(login|onetap|one_tap)|accounts/(login|onetap|one_tap))',
      resourceTypes:resources}
  }];
  function instagram(domain) {return /(^|\.)instagram\.com$/.test(domain);}
  async function permission() {
    return chrome.permissions.contains({permissions:['cookies','declarativeNetRequestWithHostAccess'],origins:['https://*.instagram.com/*']});
  }
  async function installed() {return (await chrome.declarativeNetRequest.getDynamicRules()).filter(item=>[COOKIE_RULE,LOGIN_RULE].includes(item.id));}
  async function install(enabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[COOKIE_RULE,LOGIN_RULE],addRules:enabled?rules:[]});
  }
  async function desired() {
    const {instagramLoginBlocked}=await chrome.storage.local.get('instagramLoginBlocked');
    // Migrate installations whose old cookie rule already expressed an active block.
    return typeof instagramLoginBlocked==='boolean'?instagramLoginBlocked:(await installed()).length>0;
  }
  async function status() {
    const wanted=await desired(),granted=await permission();
    if (wanted && granted && (await installed()).length!==rules.length) await install(true);
    return {blocked:wanted,effective:wanted && granted && (await installed()).length===rules.length,needsPermissions:!granted};
  }
  async function remove(cookie) {
    if (!instagram(cookie.domain)) return;
    const details={url:`https://${cookie.domain.replace(/^\./,'')}${cookie.path}`,name:cookie.name,storeId:cookie.storeId};
    if(cookie.partitionKey)details.partitionKey=cookie.partitionKey;
    await chrome.cookies.remove(details);
  }
  async function cookies() {
    const found=new Map();
    for(const store of await chrome.cookies.getAllCookieStores()) {
      for(const list of await Promise.all([
        chrome.cookies.getAll({domain:'instagram.com',storeId:store.id}),
        chrome.cookies.getAll({domain:'instagram.com',storeId:store.id,partitionKey:{}})
      ])) for(const cookie of list)found.set(JSON.stringify([cookie.domain,cookie.path,cookie.name,cookie.storeId,cookie.partitionKey]),cookie);
    }
    return [...found.values()];
  }
  async function clear() {
    for(const cookie of await cookies())await remove(cookie);
    if((await cookies()).some(cookie=>cookie.name==='sessionid'))throw new Error('Instagram session could not be cleared. Check this extension’s Instagram site access.');
  }
  async function set(enabled) {
    if(enabled && !await permission())throw new Error('Instagram cookie/site access is missing. Allow Instagram access in this extension’s Details, then turn blocking on again.');
    await install(enabled);
    await chrome.storage.local.set({instagramLoginBlocked:enabled});
    if(enabled)await clear();
    const tabs=await chrome.tabs.query({url:['https://*.instagram.com/*']});
    await Promise.allSettled(tabs.map(tab=>enabled
      ?chrome.tabs.update(tab.id,{url:new URL('/accounts/login/',tab.url).href})
      :chrome.tabs.reload(tab.id,{bypassCache:true})));
    return status();
  }
  return {status,set,remove,instagram,desired};
})();
