import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {brandOAuthCallbacks,oauthPageTheme} from '../electron/oauth-page-branding.mjs';
const original='<!doctype html><html><head><title>Authentication successful</title></head><body><div class="logo"><svg>Pi</svg></div><h1>Authentication successful</h1><p>You can close this window.</p></body></html>';
test('only the advertised loopback callback gets Suffice branding and an embedded selected font',async()=>{
 const theme=await oauthPageTheme('Geist Mono'),branding=brandOAuthCallbacks(theme);
 const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(original);});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  branding.authorizationUrl('https://provider.invalid/login?redirect_uri='+encodeURIComponent(origin+'/auth/callback'));
  const html=await (await fetch(origin+'/auth/callback?code=not-displayed&state=unchanged')).text();assert.match(html,/<title>Authentication successful · Suffice/);assert.match(html,/alt="Suffice"/);assert.match(html,/data:font\/woff2;base64/);assert.doesNotMatch(html,/<svg>Pi|not-displayed|state=unchanged/);
  assert.equal(await (await fetch(origin+'/unrelated')).text(),original);
  branding.dispose();assert.equal(await (await fetch(origin+'/auth/callback')).text(),original);
  const fallback=await oauthPageTheme('Unknown font');assert.match(fallback.css,/data:font\/woff2/);assert.match((await oauthPageTheme('System')).css,/system-ui/);
 }finally{branding.dispose();await new Promise(resolve=>server.close(resolve));}
});
