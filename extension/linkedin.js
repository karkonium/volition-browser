(() => {
  'use strict';
  const POST='.occludable-update[data-id],.feed-shared-update-v2,[data-view-name="feed-full-update"],[data-urn^="urn:li:activity:"],[data-id^="urn:li:activity:"],[componentkey^="expandedurn:li:activity"],[componentkey^="expandedurn:li:sponsoredContent"],[data-testid="mainFeed"] [componentkey^="expanded"],[data-testid="mainFeed"] [componentkey^="update-card-focus"]';
  const PERSON='.discover-entity-type-card,.mn-discovery-person-card,.mn-connection-card,[data-view-name="network-discovery-profile-card"],[data-view-name="network-discovery-card"],[data-view-name="cohort-card"]';
  const LIST='[data-view-name="cohorts-see-all-list"],.mn-pymk-list,.discover-entity-type-section,.discover-cohort,.mn-discovery__results';
  const EXCLUDED='aside,[role="navigation"],.msg-overlay-container,.msg-overlay-list-bubble,.invitation-card,.mn-invitation,.mn-invitations-preview,[data-view-name*="invitation"],[data-view-name="connections-list"]';
  const PROTECTED='.invitation-card,.mn-invitation,.mn-invitations-preview,[data-view-name*="invitation"],[data-view-name="connections-list"],nav,[role="navigation"],[role="tablist"],.mn-community-summary,.mn-network-summary,[data-view-name="network-manager"],a[href*="/mynetwork/invite-connect/"],a[href*="/mynetwork/invitation-manager/"],button[aria-label="Dismiss"],button[aria-label="Close"]';
  let surface='other',access=FiniteLinkedInPolicy.initialState(),scheduled=false,running=false,again=false;
  const hashes=new Map(),decisions=new Map();
  function classify(){
    const path=location.pathname;
    if(path==='/' || (/^\/feed(?:\/|$)/.test(path) && !/^\/feed\/update(?:\/|$)/.test(path)))return 'home';
    if(/^\/mynetwork(?:\/|$)/.test(path) && !/^\/mynetwork\/(?:invite-connect|invitation-manager|network-manager)(?:\/|$)/.test(path))return 'network';
    return 'other';
  }
  function main(){return document.querySelector('[aria-label="Primary content"]') || document.querySelector('main,[role="main"]');}
  function outer(root,selector){return [...root.querySelectorAll(selector)].filter(node=>!node.closest(EXCLUDED) && !node.parentElement?.closest(selector));}
  function postId(node){
    for(const element of [node,...node.querySelectorAll('[data-urn],[data-id],[componentkey],a[href]')]){
      for(const value of [element.getAttribute('data-urn'),element.getAttribute('data-id'),element.getAttribute('componentkey'),element.getAttribute('href')]){
        const id=value?.match(/urn:li:(activity|share|ugcPost|sponsoredContent):([\w-]+)/) || value?.match(/activity-(\d+)/);
        if(id)return id.length===3?`${id[1]}:${id[2]}`:`activity:${id[1]}`;
      }
    }
    // The current SDUI feed uses opaque stable keys rather than activity URNs.
    // Ignore feed-ranking suffixes so switching Home tabs cannot create new credit.
    if(node.closest('[data-testid="mainFeed"]')){
      const key=node.getAttribute('componentkey') || '';
      if(/^(?:expanded|update-card-focus).+/.test(key))return 'opaque:'+key.replace(/^(?:expanded|update-card-focus)/,'').replace(/FeedType_.*$/,'');
    }
    return '';
  }
  function personId(node){
    for(const anchor of node.querySelectorAll('a[href]')){
      try{
        const url=new URL(anchor.href,location.origin);
        if(/(^|\.)linkedin\.com$/.test(url.hostname) && /^\/(?:in|company|school|groups|events)\/[^/]+/.test(url.pathname))return url.pathname.replace(/\/$/,'');
      }catch{}
    }
    const id=node.getAttribute('data-entity-urn') || node.getAttribute('data-id') || node.getAttribute('componentkey');
    if(id)return id;
    return ''; 
  }
  function isInvitation(card){
    const labels=[...card.querySelectorAll('button')].map(button=>(button.getAttribute('aria-label') || button.textContent || '').trim());
    return labels.some(label=>/^Accept\b/i.test(label)) && labels.some(label=>/^Ignore\b/i.test(label));
  }
  function networkCards(root){
    const cards=new Set(outer(root,PERSON));
    for(const scope of [root]){
      for(const anchor of scope.querySelectorAll('a[href*="/in/"],a[href*="/company/"],a[href*="/school/"],a[href*="/groups/"]')){
        if(anchor.closest(EXCLUDED) || anchor.closest(PERSON))continue;
        let card=anchor.closest('li,[role="listitem"],article');
        if(!card || !scope.contains(card)){
          card=anchor.parentElement;
          // Modern classless cards repeat avatar/name links. Stop climbing when
          // the parent starts containing another person's card.
          for(let depth=0;depth<5 && card?.parentElement && card.parentElement!==scope;depth++){
            const parent=card.parentElement;
            if(parent.closest(EXCLUDED))break;
            const profiles=new Set([...parent.querySelectorAll('a[href*="/in/"],a[href*="/company/"],a[href*="/school/"]')].map(link=>{try{return new URL(link.href).pathname.replace(/\/$/,'');}catch{return link.href;}}));
            if(profiles.size!==1)break;
            card=parent;
          }
        }
        if(card && card!==scope && !card.closest(EXCLUDED))cards.add(card);
      }
    }
    return [...cards].filter(node=>![...cards].some(parent=>parent!==node && parent.contains(node)));
  }
  function gates(){
    surface=classify();
    const html=document.documentElement;if(!html)return;
    html.dataset.finiteLinkedinSurface=surface;
    html.dataset.finiteLinkedinHome=access.home.until>Date.now()?'open':'closed';
    html.dataset.finiteLinkedinNetwork=access.network.until>Date.now()?'open':'closed';
    const hidden=surface==='home' && access.home.until<=Date.now()?'main video,[role="main"] video':surface==='network' && access.network.until<=Date.now()?'[data-finite-linkedin-card="network"] video':null;
    if(hidden)for(const video of document.querySelectorAll(hidden))if(!video.paused)video.pause();
  }
  function mark(root,node){
    node.setAttribute('data-finite-linkedin-allowed','');
    for(let parent=node.parentElement;parent && root.contains(parent);parent=parent.parentElement){
      parent.setAttribute('data-finite-linkedin-branch','');if(parent===root)break;
    }
  }
  async function identity(raw){
    if(!hashes.has(raw))hashes.set(raw,crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)).then(buffer=>Array.from(new Uint8Array(buffer).slice(0,8),v=>v.toString(16).padStart(2,'0')).join('')));
    return hashes.get(raw);
  }
  async function admit(feature,id){
    const batch=access[feature],generation=batch.generation;
    if(batch.until<=Date.now())return false;
    if(batch.seen.includes(id))return true;
    const key=`${feature}:${generation}:${id}`;
    if(decisions.has(key))return decisions.get(key);
    if(batch.seen.length>=FiniteLinkedInPolicy.LIMITS[feature])return false;
    const result=await chrome.runtime.sendMessage({type:'LINKEDIN_CONSUME',feature,generation,id});
    if(result?.error)return false;
    access=FiniteLinkedInPolicy.normalize(result.access);gates();
    const allowed=!!result.allowed && access[feature].generation===generation && access[feature].until>Date.now();
    decisions.set(key,allowed);return allowed;
  }
  function clear(){
    for(const node of document.querySelectorAll('[data-finite-linkedin-root],[data-finite-linkedin-allowed],[data-finite-linkedin-branch]')){
      node.removeAttribute('data-finite-linkedin-root');node.removeAttribute('data-finite-linkedin-allowed');node.removeAttribute('data-finite-linkedin-branch');
    }
  }
  async function scan(){
    if(running){again=true;return;}running=true;
    try{
      gates();if(surface==='other'){clear();return;}
      const feature=surface,roots=[main()].filter(Boolean);
      if(feature==='network')for(const dialog of document.querySelectorAll('[role="dialog"]'))if(dialog.querySelector(LIST+','+PERSON))roots.push(dialog);
      const used=new Set(),plan=[];let count=0;
      for(const root of roots){
        const nodes=[];plan.push({root,nodes});
        const cards=feature==='home'?outer(root,POST):networkCards(root);
        if(feature==='network')nodes.push(...root.querySelectorAll(PROTECTED),...cards.filter(isInvitation));
        if(access[feature].until<=Date.now())continue;
        for(const card of cards){
          if(feature==='network' && isInvitation(card))continue;
          const raw=feature==='home'?postId(card):personId(card);if(!raw)continue;
          const id=await identity(raw);if(used.has(id))continue;used.add(id);
          if(await admit(feature,id)){
            if(classify()!==feature || access[feature].until<=Date.now())break;
            if(!card.isConnected || (feature==='home'?postId(card):personId(card))!==raw){again=true;continue;}
            nodes.push(card);card.dataset.finiteLinkedinIdentity=raw;card.setAttribute('data-finite-linkedin-card',feature);count++;
          }else card.querySelectorAll('video').forEach(video=>{if(!video.paused)video.pause();});
        }
      }
      if(classify()!==feature){schedule();return;}
      clear();
      for(const {root,nodes} of plan){root.setAttribute('data-finite-linkedin-root',feature);for(const node of nodes)mark(root,node);}
      if(document.visibilityState==='visible')await chrome.runtime.sendMessage({type:'LINKEDIN_STATUS',status:{surface,count,limit:FiniteLinkedInPolicy.LIMITS[feature]}});
    }catch(error){console.debug('Finite Scroll: LinkedIn update unavailable.');}
    finally{running=false;if(again){again=false;schedule();}}
  }
  function schedule(){gates();if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;void scan();},30);}
  globalThis.FiniteLinkedInCandidates=()=>surface==='home' && access.home.until>Date.now() && main()?outer(main(),POST).filter(node=>node.hasAttribute('data-finite-linkedin-allowed')).map(element=>({kind:'linkedinPosts',id:postId(element),element})).filter(item=>item.id):[];
  new MutationObserver(records=>{
    // A virtualized card must be re-admitted when LinkedIn changes its identity.
    for(const record of records)if(record.type==='attributes'){
      const card=record.target.closest('[data-finite-linkedin-allowed]');card?.removeAttribute('data-finite-linkedin-allowed');
    }
    schedule();
  }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-id','data-urn','componentkey','href','data-view-name']});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.linkedinAccess){access=FiniteLinkedInPolicy.normalize(changes.linkedinAccess.newValue);schedule();}});
  window.addEventListener('popstate',schedule);
  document.addEventListener('visibilitychange',schedule);
  setInterval(schedule,500);gates();
  chrome.runtime.sendMessage({type:'GET_LINKEDIN_ACCESS'}).then(result=>{access=FiniteLinkedInPolicy.normalize(result.access);schedule();}).catch(()=>{});
})();
