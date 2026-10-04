import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=readFileSync(new URL('./worker.js',import.meta.url),'utf8');
const category={id:'profile',formats:['gif'],maxBytes:2097152,strictSize:true,uploadWidth:200,uploadHeight:200};
function harness(){
  const writes=[],auth=[];
  const env={GITHUB_TOKEN:'current-test-token',SESSION_SECRET:'test-only-secret',GITHUB_OWNER:'test',GITHUB_REPO:'test',ALLOWED_ORIGINS:'https://test.example'};
  const ctx=vm.createContext({TextEncoder,TextDecoder,Response,Request,Headers,File,Uint8Array,URL,crypto:webcrypto,btoa,atob,setTimeout,console:{error(){}},fetch:async(url,options={})=>{
    auth.push(options.headers.Authorization);
    if(options.headers.Authorization!=='Bearer current-test-token')return Response.json({message:'Bad credentials'},{status:401});
    if(options.method==='PUT'){writes.push(JSON.parse(options.body));return Response.json({content:{sha:'new-sha'}})}
    const settings=String(url).includes('settings.json');
    return Response.json({sha:'test-sha',content:btoa(JSON.stringify(settings?{portfolioCategories:[category],presetCategories:[{id:'profile'}]}:[]))});
  }});
  vm.runInContext(source.replace('export default {','globalThis.worker = {'),ctx);
  return {writes,auth,env,ctx,async upload(file,isPreset=false,authenticated=true){
    // Simulate an already signed-in admin whose stored token predates rotation.
    const cookie=await ctx.seal({token:'old-test-token',iat:Date.now()},env.SESSION_SECRET);
    const form=new FormData();form.set('category','profile');form.set('file',file);
    return ctx.worker.fetch(new Request('https://api.example/api/admin/'+(isPreset?'preset-upload':'upload'),{method:'POST',headers:authenticated?{Cookie:'artmug_session='+cookie}:{},body:form}),env);
  }};
}
function gif(width=200,height=200,size=20){
  const bytes=new Uint8Array(size);bytes.set(Buffer.from('GIF89a'));bytes[6]=width&255;bytes[7]=width>>8;bytes[8]=height&255;bytes[9]=height>>8;
  return new File([bytes],'sample.gif',{type:'image/gif'});
}
test('valid GIF uses current server token for settings, image and index',async()=>{
  const h=harness(),r=await h.upload(gif());assert.equal(r.status,200);assert.equal((await r.json()).ok,true);assert.equal(h.writes.length,2);assert(h.auth.every(a=>a==='Bearer current-test-token'));
});
test('preset upload also uses the current server token',async()=>{
  const h=harness(),r=await h.upload(gif(),true);assert.equal(r.status,200);assert.equal(h.writes.length,2);
});
test('oversize profile reports the 2MB limit without writing files',async()=>{
  const h=harness(),r=await h.upload(gif(200,200,2097153));assert.equal(r.status,400);assert.match((await r.json()).error,/2MB/);assert.equal(h.writes.length,0);
});
test('wrong dimensions report required and actual dimensions',async()=>{
  const h=harness(),r=await h.upload(gif(400,400));assert.equal(r.status,400);assert.match((await r.json()).error,/200 × 200px.*400 × 400px/);assert.equal(h.writes.length,0);
});
test('unsupported profile format reports allowed format',async()=>{
  const h=harness(),r=await h.upload(new File(['not-a-gif'],'sample.png'));assert.equal(r.status,400);assert.match((await r.json()).error,/GIF/);assert.equal(h.writes.length,0);
});
test('empty files are rejected before GitHub writes',async()=>{
  const h=harness(),r=await h.upload(new File([],'empty.gif'));assert.equal(r.status,400);assert.match((await r.json()).error,/빈 파일/);assert.equal(h.writes.length,0);
});
test('upload still requires authentication',async()=>{
  const h=harness(),r=await h.upload(gif(),false,false);assert.equal(r.status,401);assert.equal(h.auth.length,0);
});
