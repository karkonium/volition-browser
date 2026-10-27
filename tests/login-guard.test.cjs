const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('missing Instagram access never reports an effective block or attempts cookie deletion',async()=>{
 let touched=false;
 const context={URL,chrome:{
  permissions:{contains:async()=>false},
  storage:{local:{get:async()=>({instagramLoginBlocked:true})}},
  declarativeNetRequest:{getDynamicRules:async()=>[{id:91001},{id:91002}],updateDynamicRules:async()=>{touched=true}},
  cookies:{getAllCookieStores:async()=>{touched=true;return[]}}
 }};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../extension/login-guard.js'),'utf8')+'\nglobalThis.guard=InstagramLoginGuard;',context);
 const status=await context.guard.status();
 assert.equal(status.blocked,true);assert.equal(status.effective,false);assert.equal(status.needsPermissions,true);
 await assert.rejects(context.guard.set(true),/cookie\/site access is missing/);assert.equal(touched,false);
});
