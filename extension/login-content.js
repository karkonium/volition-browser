(() => {
  'use strict';
  let blocked=false;
  const held=new Map();
  const authForm=form=>!!form && (!!form.querySelector('input[type="password"]') || /\/accounts\/(?:login|onetap)/i.test(form.getAttribute('action')||''));
  function loginControl(node){
    const button=node?.closest?.('button,[role="button"],input[type="submit"]');
    if(!button)return null;
    const label=(button.getAttribute('aria-label')||button.textContent||button.value||'').trim();
    return authForm(button.closest('form')) || /^(?:log in(?: with .*)?|login|continue as .*)$/i.test(label)?button:null;
  }
  function apply(){
    if(!blocked){
      for(const [element,before] of held){
        if(before.disabled===null)element.removeAttribute('disabled');else element.setAttribute('disabled',before.disabled);
        if(before.title===null)element.removeAttribute('title');else element.setAttribute('title',before.title);
        element.removeAttribute('data-finite-login-blocked');
      }
      held.clear();return;
    }
    for(const element of document.querySelectorAll('button,[role="button"],input[type="submit"]')){
      if(!loginControl(element))continue;
      if(!held.has(element))held.set(element,{disabled:element.getAttribute('disabled'),title:element.getAttribute('title')});
      element.setAttribute('disabled','');element.setAttribute('data-finite-login-blocked','');
      element.setAttribute('title','Instagram login is blocked. Turn it off in Finite Scroll to sign in.');
    }
    for(const element of held.keys())if(!element.isConnected)held.delete(element);
  }
  function stop(event){event.preventDefault();event.stopImmediatePropagation();}
  document.addEventListener('submit',event=>{if(blocked && authForm(event.target))stop(event);},true);
  document.addEventListener('click',event=>{if(blocked && loginControl(event.target))stop(event);},true);
  document.addEventListener('keydown',event=>{if(blocked && event.key==='Enter' && (authForm(event.target.closest?.('form')) || loginControl(event.target)))stop(event);},true);
  new MutationObserver(()=>{if(blocked)apply();}).observe(document,{childList:true,subtree:true});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && changes.instagramLoginBlocked){blocked=changes.instagramLoginBlocked.newValue===true;apply();}
  });
  chrome.runtime.sendMessage({type:'GET_LOGIN_BLOCK'}).then(result=>{blocked=!!result?.blocked;apply();}).catch(()=>{});
})();
