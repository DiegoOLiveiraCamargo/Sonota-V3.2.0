import { auth } from '../app/firebase';
import { browserSessionPersistence, setPersistence, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail,
  GoogleAuthProvider, OAuthProvider, signInWithPopup, linkWithPopup } from 'firebase/auth';

export type SocialProvider = 'google.com' | 'microsoft.com' | 'apple.com';
export const socialProviders: { id: SocialProvider; name: string; icon: string }[] = [
  { id: 'google.com', name: 'Google', icon: 'assets/google-logo.svg' },
  { id: 'microsoft.com', name: 'Microsoft', icon: 'assets/microsoft-logo.svg' },
  { id: 'apple.com', name: 'Apple', icon: 'assets/apple-logo.svg' },
];

type Request = (path: string, options?: any) => Promise<any>;
const messages: Record<string, string> = {
  'auth/popup-closed-by-user': 'A janela de acesso foi fechada. Tente novamente quando quiser.',
  'auth/cancelled-popup-request': 'Já existe uma janela de acesso aberta.',
  'auth/popup-blocked': 'Permita pop-ups para este site e tente novamente.',
  'auth/operation-not-allowed': 'Este método de acesso ainda não foi habilitado no Firebase.',
  'auth/unauthorized-domain': 'Este endereço precisa ser autorizado no Firebase Authentication.',
  'auth/account-exists-with-different-credential': 'Entre pelo método original da conta e vincule o novo provedor na tela de perfil.',
  'auth/credential-already-in-use': 'Esta conta já está vinculada a outra conta Sonota.',
  'auth/provider-already-linked': 'Este provedor já está vinculado à sua conta.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Entre ou recupere a senha.',
  'auth/weak-password': 'Use uma senha mais forte, com pelo menos 10 caracteres.',
  'auth/network-request-failed': 'Não foi possível conectar ao Firebase.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/requires-recent-login': 'Entre novamente para alterar sua senha.',
};
async function translated<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error: any) {
    if (messages[error.code]) error.message = messages[error.code];
    throw error;
  }
}
async function ready(request: Request) {
  if (!(await request('/auth/options')).firebaseOnly) throw new Error('Reinicie o servidor para ativar o acesso Firebase do site.');
  await auth.authStateReady();
  await setPersistence(auth, browserSessionPersistence);
}
function socialProvider(id: SocialProvider) {
  if (!socialProviders.some(provider => provider.id === id)) throw new Error('Provedor de acesso inválido.');
  const provider = id === 'google.com' ? new GoogleAuthProvider() : new OAuthProvider(id);
  if (id === 'apple.com') {
    provider.addScope('email'); provider.addScope('name');
    provider.setCustomParameters({ locale: 'pt_BR' });
  } else provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
function validatePassword(password: string) {
  if (password.length < 10 || !/\d/.test(password)) throw new Error('Use pelo menos 10 caracteres e 1 número na senha.');
}
async function finish(user: any, request: Request, data: any = {}) {
  return request('/auth/firebase', { method: 'POST', body: {
    idToken: await user.getIdToken(true),
    ...(data.name ? { name: data.name.trim(), studio: data.studio || '', role: data.role || 'Produtor Musical' } : {}),
  } });
}
// Open the popup before network awaits to preserve the browser's user activation.
const socialLogin = (id: SocialProvider, request: Request) => translated(async () => {
    auth.languageCode = 'pt-BR';
    const { user } = await signInWithPopup(auth, socialProvider(id));
    await ready(request);
    return finish(user, request, { name: user.displayName || 'Usuário Sonota' });
  });
const linkSocial = (id: SocialProvider, request: Request, expectedUid: string) => translated(async () => {
    const user = auth.currentUser;
    if (!user || user.uid !== expectedUid) throw new Error('Saia e entre novamente antes de vincular uma conta.');
    await linkWithPopup(user, socialProvider(id));
    // Linking preserves the UID; the existing server session remains valid.
    return request('/auth/me');
  });
export const siteAuth = {
  socialLogin, linkSocial,
  google: (request: Request) => socialLogin('google.com', request),
  linkGoogle: (request: Request, expectedUid: string) => linkSocial('google.com', request, expectedUid),
  login: (data: any, request: Request) => translated(async () => {
    await ready(request);
    const { user } = await signInWithEmailAndPassword(auth, data.email.trim(), data.password);
    return finish(user, request);
  }),
  register: (data: any, request: Request) => translated(async () => {
    if (!data.name.trim()) throw new Error('Preencha seu nome.');
    validatePassword(data.password);
    await ready(request);
    if (!(await request('/auth/options')).registration) throw new Error('O cadastro está desativado.');
    let user;
    try { user = (await createUserWithEmailAndPassword(auth, data.email.trim(), data.password)).user; }
    catch (error: any) {
      // Uma gravação do perfil interrompida não deve exigir outra conta.
      if (error.code !== 'auth/email-already-in-use') throw error;
      user = (await signInWithEmailAndPassword(auth, data.email.trim(), data.password)).user;
    }
    return finish(user, request, data);
  }),
  reset: (email: string) => translated(async () => {
    if (!email.trim()) throw new Error('Preencha o e-mail acima para recuperar sua senha.');
    auth.languageCode = 'pt-BR';
    try { await sendPasswordResetEmail(auth, email.trim()); }
    catch (error: any) { if (error.code !== 'auth/user-not-found') throw error; }
  }),
  logout: (request: Request) => translated(async () => {
    try { await request('/auth/me'); await request('/auth/logout', { method: 'POST' }); }
    catch (error: any) { if (error.status !== 401) throw error; }
    await signOut(auth);
    sessionStorage.removeItem('sonota_csrf');
  }),
  changePassword: (data: any, request: Request) => translated(async () => {
    validatePassword(data.newPassword);
    const { user: profile } = await request('/auth/me');
    await ready(request);
    let user = auth.currentUser;
    if (!user || user.uid !== profile.id) user = (await signInWithEmailAndPassword(auth, profile.email, data.currentPassword)).user;
    else await reauthenticateWithCredential(user, EmailAuthProvider.credential(profile.email, data.currentPassword));
    await updatePassword(user, data.newPassword);
    return finish(user, request);
  }),
  changeEmail: (email: string, password: string, request: Request) => translated(async () => {
    const { user: profile } = await request('/auth/me');
    await ready(request);
    const { user } = await signInWithEmailAndPassword(auth, profile.email, password);
    if (user.uid !== profile.id) throw new Error('A conta autenticada não corresponde ao perfil.');
    auth.languageCode = 'pt-BR';
    await verifyBeforeUpdateEmail(user, email.trim());
  }),
};
