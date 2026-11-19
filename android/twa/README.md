# App Android (TWA) da Eneven Agenda

Empacota o site (`https://agenda.eneven.com.br/painel`) como app para a Google Play, com o
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). Não há código nativo: o app abre o mesmo
site, no mesmo servidor e banco, em tela cheia.

## API 36

Mantenha o Bubblewrap em **1.27.0** ou mais novo: o projeto que ele gera já usa `compileSdkVersion 36` e
`targetSdkVersion 36` (exigido pela Google Play para app novo e atualização desde 31/08/2026). Para conferir
depois de gerar o projeto: `grep -n "SdkVersion" app/build.gradle`.

## O que o site já faz por este app

- `startUrl` é `/painel?origem=app`. A TWA também abre com `document.referrer` em `android-app://…`.
  Com isso o site marca o `<html>` com `data-app="twa"` (`src/lib/twa.ts`) e **esconde cobrança e
  assinatura** só dentro do app. No navegador comum, nada muda.
- `/.well-known/assetlinks.json` é servido pelo site a partir das variáveis `ANDROID_APP_PACKAGE` e
  `ANDROID_APP_SHA256_FINGERPRINTS` (veja `.env.example`). Sem elas, responde 404.
- Exclusão de conta: dentro do app em **Configurações > Excluir conta** (dono) ou **Mais > Excluir conta**;
  na web, a página pública `/excluir-conta` (é o link que o Play Console pede na política de exclusão).

## Notificações de novo agendamento

- `enableNotifications: true` no `twa-manifest.json` faz o Bubblewrap declarar `POST_NOTIFICATIONS` no
  `AndroidManifest.xml` e incluir o serviço de delegação. É isso que repassa o aviso web push ao Android.
- No Android 13+ a permissão é uma pergunta do sistema. O app a pede só quando o dono toca em
  **Ativar notificações** (faixa que aparece só dentro do app, `src/components/pwa/push-prompt.tsx`) ou em
  **Configurações > Notificações > Cadastrar este dispositivo**. Nunca pergunta ao abrir.
- Se o dono recusar, a faixa passa a explicar como ativar em *Configurações do Android > Apps > Eneven Agenda >
  Notificações*.
- Confira no aparelho de teste: instale o APK, entre como dono, toque em Ativar, aceite a pergunta do Android,
  faça um agendamento pela página pública e veja o aviso chegar. Confira também "Dispositivos cadastrados".

## Passo a passo

1. Instale: `npm i -g @bubblewrap/cli@1.27.0` (precisa de JDK 17 e do Android SDK; o Bubblewrap oferece baixar).
2. Crie a chave de **upload** (guarde fora do repositório e faça backup):
   `keytool -genkeypair -v -keystore android.keystore -alias eneven-agenda -keyalg RSA -keysize 2048 -validity 10000`
3. Nesta pasta: `bubblewrap update` (gera o projeto Android a partir do `twa-manifest.json`) e depois
   `bubblewrap build`. Saem `app-release-bundle.aab` (envie à Play) e um `.apk` para testar.
4. Play Console: crie o app, ative o **Play App Signing** e envie o `.aab`. Em
   *Configuração > Integridade do app* copie a impressão digital **SHA-256 da chave de assinatura do app**.
5. No servidor (Easypanel) defina `ANDROID_APP_PACKAGE=br.com.eneven.agenda` e
   `ANDROID_APP_SHA256_FINGERPRINTS=<SHA-256 da Play>` (pode incluir também a da chave de upload, separada por
   vírgula, para testar o APK assinado por ela). Reimplante e confira
   `https://agenda.eneven.com.br/.well-known/assetlinks.json`.
6. Para testar o APK local: sem o `assetlinks.json` correto o app abre como aba do navegador (com barra).
7. Ficha da loja: política de exclusão de conta = `https://agenda.eneven.com.br/excluir-conta`;
   política de privacidade = `https://agenda.eneven.com.br/privacidade`; preencha o formulário de segurança
   de dados (conta com e-mail e senha, exclusão disponível dentro do app e pela web).
8. A Play pede acesso para revisão: informe uma conta de teste (e-mail e senha) nas instruções de acesso.

Dica: o `appVersionCode` precisa subir a cada envio (`bubblewrap update` incrementa se usar `--appVersionCode`).
