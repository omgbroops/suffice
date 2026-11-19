import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const shots=process.env.BYOK_SHOTS,GOOD='sk-fake-good-1234567890abcd',BAD='sk-fake-bad-0987654321wxyz';
test('Settings > Models: add, test, lock and remove a BYOK key through the real vault',{timeout:120000},async()=>{
 // Fake OpenAI-compatible endpoint: GET /v1/models; a wrong key gets a 401 that echoes it, to prove redaction.
 const server=http.createServer((req,res)=>{const auth=req.headers.authorization||'';res.setHeader('content-type','application/json');if(auth===`Bearer ${GOOD}`){res.end('{"data":[]}');return;}res.statusCode=401;res.end(JSON.stringify({error:{message:`Incorrect API key provided: ${auth.slice(7)}`}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/v1`;
 const home=await mkdtemp(resolve(tmpdir(),'suffice-byok-ui-'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-fr-byok-keys-1',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-byok-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 let page;const logs=[];app.process().stdout.on('data',d=>logs.push(String(d)));app.process().stderr.on('data',d=>logs.push(String(d)));
 const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(120);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
 const open=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Models',exact:true}).click();await page.locator('.keys-view .keys-state').waitFor();await page.waitForTimeout(400);await page.locator('.keys-view').scrollIntoViewIfNeeded();};
 const keyFile=resolve(home,'profile','sessions','vault.key');
 try{
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await open();
  assert.match(await page.locator('.keys-state').innerText(),/Vault unlocked/);await shot('keys-empty');
  const form=page.locator('.keys-form');
  await form.getByLabel('Provider').selectOption('openai-compatible');
  await form.getByLabel('Base URL').fill(base);await form.getByLabel('API key').fill(GOOD);await form.getByRole('button',{name:'Add key'}).click();
  const row=page.locator('.keys-row[data-key-provider="openai-compatible"]');await row.waitFor();
  assert.equal(await row.locator('code').innerText(),'…abcd');assert.equal(await form.getByLabel('API key').inputValue(),'');
  await row.getByRole('button',{name:'Test'}).click();await row.getByText('Key works').waitFor();await shot('keys-tested');
  // Replace with a bad key: the fake's 401 echoes it; the UI must show the failure without the key.
  await form.getByLabel('Provider').selectOption('openai-compatible');await form.getByLabel('Base URL').fill(base);await form.getByLabel('API key').fill(BAD);await form.getByRole('button',{name:'Add key'}).click();
  await page.locator('.keys-row code',{hasText:'…wxyz'}).waitFor();
  await page.locator('.keys-row').getByRole('button',{name:'Test'}).click();await page.getByText(/^Failed/).waitFor();
  const text=await page.locator('body').innerText();assert.ok(text.includes('Failed'));
  for(const k of [GOOD,BAD])assert.ok(!(await page.content()).includes(k)&&!text.includes(k),'key never in the page');
  await shot('keys-failed');
  // Vault on disk holds no plaintext; main-process output holds none either.
  const vdir=resolve(home,'profile','sessions','vault','byok');
  for(const f of await readdir(vdir))for(const k of [GOOD,BAD])assert.ok(!(await readFile(resolve(vdir,f),'utf8')).includes(k));
  for(const k of [GOOD,BAD])assert.ok(!logs.join('').includes(k));
  // Persisted across reload.
  await page.reload();await open();await page.locator('.keys-row code',{hasText:'…wxyz'}).waitFor();
  // Lock: an unreadable key file locks the vault and the form.
  const good=await readFile(keyFile,'utf8');await writeFile(keyFile,'not json');
  await page.reload();await open();assert.match(await page.locator('.keys-state').innerText(),/Vault locked/);
  assert.ok(await page.locator('.keys-form').getByRole('button',{name:'Add key'}).isDisabled());await shot('keys-locked');
  await writeFile(keyFile,good);await page.reload();await open();assert.match(await page.locator('.keys-state').innerText(),/Vault unlocked/);
  // Remove.
  await page.locator('.keys-row').getByRole('button',{name:'Remove'}).click();await page.locator('.keys-row').waitFor({state:'detached'});
  assert.deepEqual(await readdir(vdir),[]);
  assert.deepEqual(errors,[]);
 }finally{await app.close();server.close();}
});
