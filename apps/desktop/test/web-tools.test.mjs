import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
import {crawlToMarkdown} from '../../../packages/cli/src/web-crawl.mjs';
import {mcpScope} from '../../../packages/cli/src/mcp-scope.mjs';
const shots=process.env.SHOTS;
const PAGE=`<!doctype html><title>Retry backoff guide</title><script>${'track();'.repeat(900)}</script><nav><a href="/x">Home</a><a href="/y">Docs</a></nav><article><h1>Retry backoff guide</h1><p>${'Use exponential backoff with jitter. '.repeat(12)}</p><ul><li>cap the delay</li><li>add jitter</li></ul></article><footer>junk</footer>`;
// Drives the Web toolkit switch in Settings and the compact web cards in chat, using the real crawl tool's output.
test('web tools: Settings switch gates the toolkit and chat shows compact cards with url, title, size, tokens saved',{timeout:120000},async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(PAGE);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/docs/retry`;
 const crawl=await crawlToMarkdown(base,{allowPrivate:true});
 const home=await mkdtemp(resolve(tmpdir(),'suffice-webtools-'));await mkdir(resolve(home,'history'),{recursive:true});if(shots)await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_SESSIONS_SOCKET:'sfx-fr-web-tools-1',SUFFICE_HISTORY_HOME:resolve(home,'history')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const stderr=[];app.process().stderr.on('data',c=>stderr.push(String(c)));
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));await page.locator('.composer').waitFor();
  const shot=async(name,need)=>{if(!shots)return;for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);if(need)await page.locator(need).first().waitFor();await page.waitForTimeout(300);await page.screenshot({path:resolve(shots,`${name}-${theme}.png`)});}};
  // Settings: the Web toolkit now lists the crawler and its switch is the one the session reads.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Tools & MCP',exact:true}).click();
  const row=page.locator('.settings-option').filter({hasText:'Search and fetch pages'});await row.waitFor();assert.match(await row.innerText(),/4 tools/);
  const sw=page.getByRole('switch',{name:'Web toolkit'});assert.equal(await sw.getAttribute('aria-checked'),'true');await shot('settings-web-on');
  await sw.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Web toolkit"]')?.getAttribute('aria-checked')==='false');
  assert.equal(JSON.parse(await readFile(resolve(home,'mcp-scope.json'),'utf8')).global['toolkit:web'],false);
  assert.equal(mcpScope(home).toolkit('web'),false,'the CLI session sees the switch');assert.equal(mcpScope(home).tool('crawl_to_markdown'),false);await shot('settings-web-off');
  await sw.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Web toolkit"]')?.getAttribute('aria-checked')==='true');assert.equal(mcpScope(home).tool('crawl_to_markdown'),true);
  // Chat: stub the run, then stream web tool events the way the engine emits nested calls.
  await app.evaluate(({ipcMain})=>{for(const a of ['run','thread','threads','models'])ipcMain.removeHandler('suffice:'+a);ipcMain.handle('suffice:models',()=>[{provider:'anthropic',id:'claude-haiku',name:'Claude Haiku',available:true,efforts:['low']}]);ipcMain.handle('suffice:threads',()=>[]);ipcMain.handle('suffice:thread',(_e,id)=>({id,title:id,messages:[]}));ipcMain.handle('suffice:run',()=>new Promise(()=>{}));});
  await page.evaluate(()=>localStorage.setItem('suffice-model',JSON.stringify({provider:'anthropic',model:'claude-haiku',effort:'low'})));await page.reload();await page.locator('.composer').waitFor();
  await page.locator('#prompt').fill('Summarise the retry guide');await page.locator('#prompt').press('Enter');await page.locator('.thread-status').waitFor();
  const send=v=>app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',v),v);
  await send({event:'thread_started',id:'web-1'});
  await send({event:'tool_start',id:'t1',name:'codemode',input:{code:'return 1'}});
  await send({event:'tool_start',id:'t1/1',name:'web_search',input:{query:'exponential backoff jitter'}});
  await send({event:'tool_end',id:'t1/1',result:{content:[{type:'text',text:'1. Backoff guide\nhttps://example.com/a\n2. Jitter notes\nhttps://example.org/b'}]}});
  await send({event:'tool_start',id:'t1/2',name:'crawl_to_markdown',input:{url:base}});
  await send({event:'tool_output',id:'t1/2',result:{content:[{type:'text',text:'Fetching'}]}});
  await page.waitForFunction(()=>document.querySelectorAll('.web-card[data-status=pending]').length===1);
  await send({event:'tool_end',id:'t1/2',result:{content:[{type:'text',text:crawl.text}],details:crawl.details}});
  await send({event:'tool_start',id:'t1/3',name:'fetch_content',input:{url:'https://example.com/missing'}});
  await send({event:'tool_end',id:'t1/3',isError:true,result:{content:[{type:'text',text:'HTTP 404'}]}});
  await page.locator('.thread-activity > summary').first().click();
  const cards=page.locator('.web-card');await cards.nth(2).waitFor();assert.equal(await cards.count(),3);
  const search=await cards.nth(0).innerText(),page2=await cards.nth(1).innerText(),failed=await cards.nth(2).innerText();
  assert.match(search,/Searched the web/);assert.match(search,/exponential backoff jitter/);assert.match(search,/2 sources/);
  assert.match(page2,/Crawled to markdown/);assert.match(page2,new RegExp(base.replace(/^https?:\/\//,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.match(page2,/Retry backoff guide/);assert.match(page2,/\d+(\.\d)? (B|KB)/);assert.match(page2,/\d+(\.\d)?k? tokens saved/);
  assert.ok(crawl.details.savedTokens>1000,'the fixture really saves tokens');
  assert.match(failed,/Fetched page/);assert.match(failed,/example\.com\/missing/);assert.match(failed,/Failed/);
  // Nothing covered: each card sits inside the thread column and above the composer.
  const geo=await page.evaluate(()=>{const c=document.querySelector('.composer').getBoundingClientRect();return [...document.querySelectorAll('.web-card')].map(e=>{const r=e.getBoundingClientRect(),f=e.querySelector('.web-card-facts').getBoundingClientRect();return {w:r.width,b:r.bottom,fits:f.right<=r.right+0.5&&f.left>=r.left-0.5,above:r.bottom<=c.top+0.5};});});
  for(const g of geo){assert.ok(g.w>200&&g.fits&&g.above,JSON.stringify(g));}
  // The group label keeps the plain verbs, not the card facts.
  assert.doesNotMatch(await page.locator('.thread-activity > summary').first().innerText(),/tokens saved|KB/);
  await shot('chat-web-cards','.web-card');
  await cards.nth(1).locator('summary').click();assert.match(await cards.nth(1).locator('.tool-output').innerText(),/# Retry backoff guide/);await shot('chat-web-card-open','.web-card .tool-output:visible');
  assert.deepEqual(errors,[]);assert.equal(stderr.join('').includes('[no-dialog]'),false,stderr.join(''));
 }finally{await app.close().catch(()=>{});server.close();}
});
