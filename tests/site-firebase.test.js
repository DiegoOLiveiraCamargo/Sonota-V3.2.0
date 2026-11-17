import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('../mobile/node_modules/typescript');
const compiled = ts.transpileModule(readFileSync(new URL('../mobile/src/site/firebase-auth.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture() {
  const calls=[], state={signup:0,signin:0,failProfile:false,exists:false,signinError:null};
  const user={uid:'uid',email:'pessoa@example.test',displayName:'Pessoa Google',getIdToken:async()=> 'token'};
  const auth={authStateReady:async()=>{},currentUser:user};
  const sdk={setPersistence:async()=>{},browserSessionPersistence:'session',
    GoogleAuthProvider:class {setCustomParameters(params){calls.push(['google-params',params]);}},
    OAuthProvider:class {constructor(id){this.providerId=id;calls.push(['provider',id]);}setCustomParameters(params){calls.push(['oauth-params',params]);}addScope(scope){calls.push(['scope',scope]);}},
    signInWithPopup:async()=>{calls.push(['popup']);if(state.signinError)throw state.signinError;return {user};},
    linkWithPopup:async()=>calls.push(['link']),
    verifyBeforeUpdateEmail:async(u,email)=>calls.push(['verify-email',email]),
    signInWithEmailAndPassword:async()=>{state.signin++;if(state.signinError)throw state.signinError;return {user};},
    createUserWithEmailAndPassword:async()=>{state.signup++;if(state.exists)throw {code:'auth/email-already-in-use'};state.exists=true;return {user};},
    sendPasswordResetEmail:async(a,email)=>calls.push(['reset',email]),
    signOut:async()=>calls.push(['signout']),EmailAuthProvider:{credential:(email,password)=>({email,password})},
    reauthenticateWithCredential:async()=>calls.push(['reauth']),updatePassword:async()=>calls.push(['password']),
  };
  const exports={};
  vm.runInNewContext(compiled,{exports,sessionStorage:{removeItem:()=>calls.push(['clear'])},require:name=>name==='firebase/auth'?sdk:{auth}});
  const request=async(path,options)=>{
    calls.push([path,options]);
    if(path==='/auth/options')return {firebaseOnly:true,registration:true};
    if(path==='/auth/firebase'&&state.failProfile)throw new Error('Firestore indisponível');
    return {user:{id:'uid',email:user.email}};
  };
  return {site:exports.siteAuth,state,calls,request};
}
test('Site: cadastro envia perfil e token, nunca senha ao backend, e retoma gravação interrompida',async()=>{
  const {site,state,calls,request}=fixture();
  const data={name:'Pessoa',email:'pessoa@example.test',password:'senha-secreta123',role:'Músico',studio:'Estúdio'};
  state.failProfile=true;
  await assert.rejects(site.register(data,request));
  state.failProfile=false;
  await site.register(data,request);
  assert.equal(state.signin,1);
  const sent=calls.filter(c=>c[0]==='/auth/firebase');
  assert.equal(sent[1][1].body.role,'Músico');
  assert.equal(JSON.stringify(calls).includes(data.password),false);
});
test('Site: erro Firebase não ativa login local',async()=>{
  const {site,state,calls,request}=fixture();
  state.signinError={code:'auth/invalid-credential'};
  await assert.rejects(site.login({email:'pessoa@example.test',password:'errada'},request));
  assert.equal(calls.some(c=>c[0]==='/auth/login'),false);
});
test('Site: recuperação, troca de senha e logout usam Firebase',async()=>{
  const {site,calls,request}=fixture();
  await assert.rejects(site.reset(' '));
  await site.reset(' pessoa@example.test ');
  assert.equal(calls[0][1],'pessoa@example.test');
  await site.changePassword({currentPassword:'antiga',newPassword:'nova-senha-123'},request);
  assert.ok(calls.find(c=>c[0]==='reauth'));
  assert.ok(calls.find(c=>c[0]==='password'));
  assert.ok(calls.find(c=>c[0]==='/auth/firebase'));
  await site.logout(request);
  assert.deepEqual(calls.slice(-2),[['signout'],['clear']]);
});

test('Google: seleciona conta e envia token e nome ao backend sem senha',async()=>{
  const {site,calls,request}=fixture();
  await site.google(request);
  assert.equal(calls.find(c=>c[0]==='google-params')[1].prompt,'select_account');
  const sent=calls.find(c=>c[0]==='/auth/firebase')[1].body;
  assert.equal(sent.name,'Pessoa Google');
  assert.equal(sent.idToken,'token');
  assert.equal('password' in sent,false);
  assert.ok(calls.findIndex(c=>c[0]==='popup') < calls.findIndex(c=>c[0]==='/auth/options'));
});

test('Google: cancelamento não cria sessão e vínculo usa usuário existente',async()=>{
  const {site,state,calls,request}=fixture();
  state.signinError={code:'auth/popup-closed-by-user'};
  await assert.rejects(site.google(request));
  assert.equal(calls.some(c=>c[0]==='/auth/firebase'),false);
  state.signinError=null;
  await site.linkGoogle(request,'uid');
  assert.ok(calls.some(c=>c[0]==='link'));
  await assert.rejects(site.linkGoogle(request,'outra-conta'));
});

test('E-mail: confirma novo endereço no Firebase sem enviar senha ao backend',async()=>{
  const {site,calls,request}=fixture();
  await site.changeEmail(' novo@example.test ','senha-privada',request);
  assert.ok(calls.some(c=>c[0]==='verify-email' && c[1]==='novo@example.test'));
  assert.equal(JSON.stringify(calls).includes('senha-privada'),false);
  assert.equal(calls.some(c=>c[0]==='/profile'),false);
});

test('Senha: cadastro e alteração exigem 10 caracteres e um número',async()=>{
  const {site,calls,request}=fixture();
  for(const password of ['curta1','semanumeronenhum']){
    await assert.rejects(site.register({name:'Pessoa',email:'a@example.test',password},request));
    await assert.rejects(site.changePassword({currentPassword:'antiga',newPassword:password},request));
  }
  assert.equal(calls.length,0);
});

for(const provider of ['microsoft.com','apple.com']){
  test(`${provider}: login e vínculo preservam sessão Sonota e usam o provedor correto`,async()=>{
    const {site,calls,request}=fixture();
    await site.socialLogin(provider,request);
    assert.ok(calls.some(c=>c[0]==='provider'&&c[1]===provider));
    assert.ok(calls.some(c=>c[0]==='/auth/firebase'&&c[1].body.idToken==='token'));
    if(provider==='apple.com'){
      assert.ok(calls.some(c=>c[0]==='scope'&&c[1]==='email'));
      assert.ok(calls.some(c=>c[0]==='scope'&&c[1]==='name'));
    }else assert.equal(calls.find(c=>c[0]==='oauth-params')[1].prompt,'select_account');
    calls.length=0;
    await site.linkSocial(provider,request,'uid');
    assert.ok(calls.some(c=>c[0]==='link'));
    assert.equal(calls.some(c=>c[0]==='popup'||c[0]==='/auth/firebase'),false);
    calls.length=0;
    await assert.rejects(site.linkSocial(provider,request,'outro-uid'));
    assert.equal(calls.length,0);
  });
}
test('Provedor inválido não abre popup; conflito não cria sessão Sonota',async()=>{
  const {site,state,calls,request}=fixture();
  await assert.rejects(site.socialLogin('unknown.com',request));
  assert.equal(calls.length,0);
  state.signinError={code:'auth/account-exists-with-different-credential'};
  await assert.rejects(site.socialLogin('apple.com',request));
  assert.equal(calls.some(c=>c[0]==='/auth/firebase'),false);
});
