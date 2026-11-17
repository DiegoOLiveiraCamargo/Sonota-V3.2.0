// Browser smoke test with an isolated database and simulated Firebase services.
// No real accounts or project data are changed. Requires installed Chrome.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const temp=await mkdtemp(path.join(tmpdir(),'sonota-ui-check-'));
const docs=new Map();
const claims={uid:'ui-check',email:'ui@example.test',auth_time:Date.now()/1000};
const ref=uid=>({uid,get:async()=>({exists:docs.has(uid),data:()=>docs.get(uid)})});
const runtime=createApp({dataDir:path.join(temp,'data'),firebaseOnly:true,aiEnabled:false,audioEnabled:false,ollamaUrl:'',cloudServices:{
  firebaseAuth:{verifyIdToken:async()=>claims,verifySessionCookie:async()=>claims,createSessionCookie:async()=> 'ui-check',getUser:async()=>({providerData:[{providerId:'google.com'}]})},
  firestore:{collection:()=>({doc:ref}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,data,opts)=>docs.set(r.uid,opts?.merge?{...docs.get(r.uid),...data}:data)})}
}});
const server=runtime.app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
runtime.config.origins.push(base);
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
let socket,sequence=0;
const pending=new Map(),errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let launchError;chrome.on('error',error=>{launchError=error;});
async function until(fn,label){for(let i=0;i<100;i++){if(launchError)throw launchError;try{const value=await fn();if(value)return value;}catch{}await sleep(100);}throw new Error(`Timeout: ${label}`);}
async function send(method,params={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},10000);pending.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;}
async function ready(expression,label){return until(()=>evaluate(expression),label);}
try{
  const port=await until(async()=>Number((await readFile(path.join(temp,'chrome','DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome');
  const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);const item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timeout);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/app/'});
  await ready(`document.querySelector('.google-signin-btn')?.getAttribute('aria-label') === 'Continuar com Google'`,'Google button');
  assert.equal(await evaluate(`!!document.querySelector('input[autocomplete="email"]')`),true);
  console.log('OK: tela de login e botão Google.');
  const login=await fetch(base+'/api/auth/firebase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:'fake',name:'Teste de interface'})});
  assert.equal(login.status,200);
  await send('Network.setCookie',{name:'sonota_firebase',value:'ui-check',url:base,httpOnly:true});
  await send('Page.reload');await ready(`!!document.querySelector('.app-shell')`,'authenticated app');
  await evaluate(`location.hash='#/clientes'`);await ready(`document.querySelector('h1')?.textContent.includes('Clientes')`,'clients');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>/Cadastrar novo cliente/.test(b.textContent))?.click()`);
  await ready(`!!document.querySelector('app-modal [role="dialog"]')`,'client modal');
  await ready(`document.querySelector('app-modal [role="dialog"]').contains(document.activeElement)`,'modal focus');
  await evaluate(`document.querySelector('app-modal [role="dialog"]').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
  assert.equal(await evaluate(`document.querySelector('app-modal [role="dialog"]').contains(document.activeElement)`),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await ready(`!document.querySelector('app-modal [role="dialog"]')`,'close modal');
  await evaluate(`location.hash='#/perfil'`);await ready(`document.querySelector('h1')?.textContent==='Perfil'`,'profile');
  assert.equal(await evaluate(`document.querySelector('input[name="profile-email"]').readOnly`),true);
  assert.equal(await evaluate(`!!document.querySelector('input[name="pwd-new"]')`),false);
  await evaluate('history.back()');await ready(`document.querySelector('h1')?.textContent.includes('Clientes')`,'back');
  await evaluate('history.forward()');await ready(`document.querySelector('h1')?.textContent==='Perfil'`,'forward');
  await send('Page.reload');await ready(`document.querySelector('h1')?.textContent==='Perfil'`,'refresh preserves route');
  console.log('OK: navegação, histórico, atualização e perfil Google sem senha local.');
  console.log('OK: foco do modal, Tab e Escape.');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await mkdir('.build-temp',{recursive:true});
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile('.build-temp/ui-mobile.png',Buffer.from(screenshot.data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('OK: perfil em tela de 390px sem rolagem horizontal ou exceções JavaScript.');
}finally{
  socket?.close();chrome.kill();
  if(chrome.exitCode===null)await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(3000)]);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await runtime.close();
  const resolved=path.resolve(temp),root=path.resolve(tmpdir())+path.sep;
  if(!resolved.startsWith(root)||!path.basename(resolved).startsWith('sonota-ui-check-'))throw new Error('Unsafe temporary path');
  await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
