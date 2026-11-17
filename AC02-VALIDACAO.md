# AC02 — implementação e validação

## Armazenamento definido para a entrega

Conforme decisão do responsável pelo projeto, Firebase Authentication gerencia as
contas e Firestore guarda os perfis em `usuarios/{uid}`. Clientes, projetos,
financeiro, biblioteca e arquivos permanecem no computador, com SQLite e
armazenamento privado. Não há sincronização desses dados entre computadores.
Não foi feita migração nem alteração nos dados existentes.

## Acesso e perfil

- Login/cadastro por e-mail e senha e botão **Continuar com Google**.
- O Google abre a seleção de conta; o primeiro acesso cria o perfil e os seguintes
  usam o mesmo UID. Contas existentes podem vincular Google na tela Perfil.
- Conflitos de conta/provedor são informados; não se mesclam dados de UIDs distintos.
- Conta somente Google não mostra formulário de senha local nem edição de e-mail.
- Contas com senha podem solicitar mudança de e-mail: o Firebase envia um link ao
  novo endereço. O endereço só muda após confirmação. Entre novamente depois de
  confirmar; o perfil Firestore é atualizado com o e-mail autenticado.
- Cadastro e troca de senha exigem 10 caracteres e pelo menos um número.
- Recuperação de senha, logout, validação de sessão e proteção CSRF mantidos.

## Ativação necessária no console Firebase

1. Abra o projeto `bancodosonotaapp` no [console Firebase](https://console.firebase.google.com/project/bancodosonotaapp/authentication/providers).
2. Em **Authentication → Sign-in method**, adicione/habilite **Google**.
3. Escolha o e-mail de suporte do projeto e salve.
4. Em **Authentication → Settings → Authorized domains**, confira `localhost`.
   Para acesso local, use `http://localhost:3000/app/`. Outros hosts precisam ser
   autorizados separadamente.
5. Mantenha E-mail/senha habilitado para o fluxo existente.

A verificação remota desta implementação confirmou acesso de leitura ao Firestore
e `localhost` autorizado; a configuração do provedor Google retornou HTTP 404.
O responsável pelo projeto precisa concluir a ativação acima e testar sua conta.
Nenhuma conta real foi criada ou alterada durante a validação automatizada.

O fluxo Google implementado usa o SDK Web. A versão instalada Tauri/Capacitor
precisa de validação própria: WebViews podem exigir OAuth pelo navegador do sistema.
Não se deve considerar o login Google nativo homologado apenas com os testes Web.

Referências: [Google com Firebase](https://firebase.google.com/docs/auth/web/google-signin),
[API de autenticação e confirmação de e-mail](https://firebase.google.com/docs/reference/js/auth).

## Navegação e acessibilidade

### Microsoft e Apple

Login/cadastro e a seção **Perfil → Contas vinculadas** agora oferecem Google,
Microsoft e Apple. O vínculo usa o usuário Firebase atual, preservando seu UID e
seus dados locais. O SDK Firebase gerencia o OAuth; os segredos ficam no console,
nunca no frontend ou no `.env` do navegador.

**Microsoft:** registre um aplicativo no Microsoft Entra, escolha os tipos de conta
permitidos (inclua contas pessoais se quiser Outlook/Hotmail), configure o retorno
Web `https://bancodosonotaapp.firebaseapp.com/__/auth/handler`, crie um segredo de
cliente e informe Client ID e Client Secret no provedor Microsoft do Firebase.
Habilite e salve. Guarde a data de expiração do segredo para renová-lo.

**Apple:** configure Sign in with Apple no Apple Developer, um App ID principal,
um Services ID para Web e a chave privada correspondente. Cadastre o domínio
`bancodosonotaapp.firebaseapp.com` e o mesmo URL de retorno acima. Informe Services
ID, Team ID, Key ID e chave privada no provedor Apple do Firebase. Essa configuração
depende da participação no Apple Developer Program. Para e-mails privados da Apple,
configure também o Private Email Relay para os e-mails enviados pelo Firebase.
O nome pode não ser fornecido em acessos posteriores; nesse caso, o perfil existente
é mantido, e novos perfis sem nome usam um nome provisório editável no Perfil.

Os botões estão implementados; o acesso real depende de ativar os provedores com
suas credenciais. Nenhuma credencial Microsoft/Apple foi criada nesta implementação.
Referências oficiais: [Microsoft](https://firebase.google.com/docs/auth/web/microsoft-oauth)
e [Apple](https://firebase.google.com/docs/auth/web/apple).

- URLs como `/app/#/clientes`, `/app/#/perfil` e `/app/#/projetos/ID`.
- Voltar/avançar do navegador e atualização preservam a tela.
- Links diretos continuam sujeitos à autenticação e ao isolamento por conta.
- Modais têm nome acessível, foco inicial, contenção de Tab, Escape e retorno do foco.
- Foco visível, redução de animações e mensagens de erro acessíveis.

## Comandos de verificação

```powershell
npm.cmd run doctor
node --env-file-if-exists=.env scripts/check-firebase-remote.js
node --test --test-timeout=20000 --test-concurrency=1 tests/*.test.js
npm.cmd run ui:build
node scripts/ui-smoke.mjs
```

O diagnóstico remoto faz apenas leituras e não exibe tokens, credenciais ou dados
de usuários. O teste de navegador exige Chrome instalado (`CHROME_PATH` permite
outro caminho), usa banco temporário e Firebase simulado. Ele não comprova o OAuth
real nem o recebimento dos e-mails. A captura de tela fica em `.build-temp/`.

Os testes de IA usam um servidor HTTP simulado. As chamadas de indexação e busca
compartilham o processamento pendente de um mesmo documento; respostas antigas não
sobrescrevem no cache uma versão mais recente do documento.

## Roteiro final com serviços reais

Validação executada nesta implementação: **38 testes automatizados aprovados**,
build Angular aprovado e teste Chrome aprovado para login visível, histórico,
atualização de página, perfil Google, teclado nos modais e layout de 390 px.
Esses testes de interface usam serviços Firebase simulados; o diagnóstico remoto
de Firestore e domínios foi executado separadamente com a configuração real.

1. Criar conta por e-mail, sair, entrar e recuperar a senha.
2. Entrar pelo Google, escolher uma conta, sair e entrar novamente; conferir o mesmo perfil.
3. Vincular Google a uma conta existente e conferir que seus dados locais permanecem.
4. Solicitar troca de e-mail, confirmar no novo endereço e entrar novamente.
5. Criar cliente/projeto, anexar áudio e registrar financeiro; reiniciar e conferir persistência.
6. Entrar com outra conta e conferir isolamento dos registros e arquivos.
7. Navegar pelo menu, histórico e links diretos em desktop e celular.
8. Com Ollama e os modelos instalados, demonstrar busca/assistente; com o worker de
   áudio instalado, executar Stems/MIDI/Partitura nos formatos suportados.

A homologação de OAuth real, mensagens de e-mail, Tauri/Capacitor e processamento
real de áudio continua dependente dessas verificações no ambiente de entrega.
