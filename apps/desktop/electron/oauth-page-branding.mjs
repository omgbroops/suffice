import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const loopback=host=>['127.0.0.1','::1','[::1]','localhost','::ffff:127.0.0.1'].includes(host);
const fonts={Geist:'@fontsource/geist/files/geist-latin-400-normal.woff2','Geist Mono':'@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2','JetBrains Mono':'@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'};

export async function oauthPageTheme(font='Inter'){
 const logo=await readFile(new URL('../assets/suffice-logo.svg',import.meta.url));
 let bytes;
 if(font!=='System'){
  try{bytes=await readFile(fonts[font]?require.resolve(fonts[font]):new URL('../public/fonts/InterVariable-latin.woff2',import.meta.url));}
  catch{bytes=await readFile(new URL('../dist/fonts/InterVariable-latin.woff2',import.meta.url));}
 }
 const family=bytes?'"Suffice Interface",sans-serif':'system-ui,sans-serif';
 return {logo:'data:image/svg+xml;base64,'+logo.toString('base64'),css:(bytes?'@font-face{font-family:"Suffice Interface";src:url(data:font/woff2;base64,'+bytes.toString('base64')+') format("woff2");font-weight:100 900;font-display:swap;}':'')+'body{font-family:'+family+';}h1{font-weight:500}.logo img{width:100%;height:100%;display:block}'};
}
export function brandOAuthHtml(html,theme){
 if(!/<title>Authentication (?:successful|failed)<\/title>/.test(html))return html;
 return html.replace(/<title>([^<]+)<\/title>/,'<title>$1 · Suffice</title>').replace(/<div class="logo">[\s\S]*?<\/div>/,`<div class="logo"><img src="${theme.logo}" alt="Suffice"></div>`).replace('</head>',`<style>${theme.css}</style></head>`);
}
// The SDK owns callback validation and token exchange. This temporary listener only
// skins its HTML responses at explicitly advertised local callback endpoints.
export function brandOAuthCallbacks(theme){
 const endpoints=new Set();
 const observe=({request,response})=>{
  try{
   const socket=request.socket;if(!loopback(socket.localAddress)||!loopback(socket.remoteAddress)||request.method!=='GET')return;
   const path=new URL(request.url,'http://localhost').pathname;if(!endpoints.has(socket.localPort+path))return;
   const end=response.end;
   response.end=function(chunk,...args){
    if((typeof chunk==='string'||Buffer.isBuffer(chunk))&&!response.hasHeader('content-length'))chunk=brandOAuthHtml(String(chunk),theme);
    return end.call(this,chunk,...args);
   };
  }catch{/* Presentation must never interfere with the provider's login flow. */}
 };
 subscribe('http.server.request.start',observe);
 return {
  authorizationUrl(value){try{const url=new URL(value);for(const key of ['redirect_uri','callback_url']){const target=url.searchParams.get(key);if(!target)continue;const callback=new URL(target);if(callback.protocol==='http:'&&loopback(callback.hostname))endpoints.add((callback.port||80)+callback.pathname);}}catch{}},
  dispose(){unsubscribe('http.server.request.start',observe);endpoints.clear();}
 };
}
