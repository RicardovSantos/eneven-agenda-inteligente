/**
 * Detecção do app Android (Trusted Web Activity, TWA) que empacota o PWA para a Google Play.
 *
 * O Chrome abre a TWA com `document.referrer` começando em `android-app://<pacote>`; o endereço
 * de abertura do app também leva `?origem=app` (veja `android/twa/twa-manifest.json`). O sinal só
 * existe na primeira página, então ele é guardado em `sessionStorage` (por aba, nunca compartilhado
 * com o Chrome comum do mesmo aparelho) e o resto do site lê o atributo `data-app="twa"` do `<html>`.
 *
 * Por que no navegador e não no servidor: um cookie de "estou no app" valeria também para o Chrome
 * comum do mesmo aparelho (a TWA usa o mesmo perfil), e esconderia a cobrança de quem assina pelo site.
 * Aqui o script roda antes da primeira pintura, então não há piscada de conteúdo.
 */
export const TWA_STORAGE_KEY = "eneven-app-android";
export const TWA_LAUNCH_PARAM = "origem";
export const TWA_LAUNCH_VALUE = "app";
export const TWA_REFERRER_PREFIX = "android-app://";

/** Roda no `<head>`: marca o `<html>` com `data-app="twa"` quando a página está dentro do app Android. */
export const TWA_INIT_SCRIPT = `try{var k=${JSON.stringify(TWA_STORAGE_KEY)},a=false;try{a=sessionStorage.getItem(k)==="1"}catch(e){}if(!a){var r=document.referrer||"",q=new URLSearchParams(location.search).get(${JSON.stringify(TWA_LAUNCH_PARAM)});if(r.indexOf(${JSON.stringify(TWA_REFERRER_PREFIX)})===0||q===${JSON.stringify(TWA_LAUNCH_VALUE)}){a=true;try{sessionStorage.setItem(k,"1")}catch(e){}}}if(a)document.documentElement.setAttribute("data-app","twa")}catch(e){}`;

/** Atributos para esconder um bloco quando a página roda dentro do app Android (cobrança e assinatura). */
export const HIDE_IN_APP = { "data-ocultar-no-app": "" } as const;

/** Atributos para mostrar um bloco só dentro do app Android (ex.: o aviso no lugar da cobrança). */
export const ONLY_IN_APP = { "data-somente-no-app": "" } as const;
