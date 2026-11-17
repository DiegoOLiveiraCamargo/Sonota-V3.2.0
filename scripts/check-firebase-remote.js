// Read-only checks. Never print tokens, credentials, user records or provider secrets.
import { applicationDefault } from 'firebase-admin/app';
import { firestore } from '../src/firebase-admin.js';

const timeout=setTimeout(()=>{console.error('Verificação remota excedeu 25 segundos.');process.exit(1);},25000);
let failures=0;
try {
  const {access_token}=await applicationDefault().getAccessToken();
  const project=encodeURIComponent(process.env.FIREBASE_PROJECT_ID || '');
  const headers={Authorization:`Bearer ${access_token}`};
  const response=await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`,{headers,signal:AbortSignal.timeout(10000)});
  if(response.ok){
    const config=await response.json();
    console.log(config.enabled?'OK: Provedor Google habilitado.':'FALTA: Habilitar Google no Firebase Authentication.');
    if(!config.enabled)failures++;
  }else{console.log(`Não foi possível consultar o provedor Google (HTTP ${response.status}). Confira no console Firebase.`);failures++;}
  const settings=await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,{headers,signal:AbortSignal.timeout(10000)});
  if(settings.ok){
    const config=await settings.json();
    const local=(config.authorizedDomains||[]).includes('localhost');
    console.log(local?'OK: localhost autorizado.':'FALTA: Autorizar localhost no Firebase Authentication.');
    if(!local)failures++;
  }else{console.log(`Não foi possível consultar domínios autorizados (HTTP ${settings.status}).`);failures++;}
  await firestore.collection('usuarios').limit(1).get();
  console.log('OK: Leitura remota do Firestore autorizada (nenhum dado exibido).');
}catch(error){console.error('Falha na conexão remota:',String(error.code||error.cause?.code||error.name));failures++;}
finally{clearTimeout(timeout);await firestore.terminate();process.exitCode=failures?1:0;}
