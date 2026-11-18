import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const shots=process.env.USAGE_SHOTS;
const at=(day,hour=12)=>new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()-day,hour).toISOString();
const msg=(day,role,extra)=>JSON.stringify({type:'message',timestamp:at(day),message:{role,...extra}});
const use=(input,output,cacheRead,cacheWrite,total)=>({input,output,cacheRead,cacheWrite,cost:{total}});

test('Usage page and composer optimizer hint work through the real desktop UI',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-usage-ui-'));await mkdir(resolve(home,'sessions/proj'),{recursive:true});
 const thread=(name,turns)=>[JSON.stringify({type:'session',id:name,timestamp:at(5),cwd:'/tmp/'+name}),msg(5,'user',{content:[{type:'text',text:name}]}),...turns].join('\n')+'\n';
 await writeFile(resolve(home,'sessions/proj/a.jsonl'),thread('Port the billing page',[msg(4,'assistant',{model:'sol',content:[],usage:use(1200,800,9000,500,.42)}),msg(2,'assistant',{model:'sol',content:[],usage:use(900,600,15000,0,.31)}),msg(0,'assistant',{model:'sol',content:[],usage:use(400,300,20000,0,.12)})]));
 await writeFile(resolve(home,'sessions/proj/b.jsonl'),thread('Fix the flaky login test',[msg(3,'assistant',{model:'sol-mini',content:[],usage:use(500,200,0,0,.03)}),msg(1,'assistant',{model:'sol-mini',content:[],usage:use(300,100,2000,0,.02)})]));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-feat-usage-optimizer',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-usage-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 const shot=async(name)=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(120);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
 let page;
 try{
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:models');ipcMain.handle('suffice:models',()=>[{provider:'p',id:'sol',name:'Sol',available:true,efforts:['low','medium','high']},{provider:'p',id:'sol-mini',name:'Sol Mini',available:true,efforts:['low']}]);});
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{localStorage.setItem('suffice-model',JSON.stringify({provider:'p',model:'sol',effort:'high'}));});await page.reload();
  await page.waitForFunction(()=>document.querySelector('.composer')?.modelState?.().model?.id==='sol');
  const prompt=page.locator('#prompt'),hint=page.locator('.usage-hint'),effort=()=>page.locator('.composer').evaluate(f=>f.modelState().effort),model=()=>page.locator('.composer').evaluate(f=>f.modelState().model.id);

  // Composer hint: shown for a simple ask, never switches on its own, applies on click.
  await prompt.fill('Explain what this function does');await hint.waitFor();
  assert.match(await hint.innerText(),/Low effort is usually enough/);assert.equal(await effort(),'high');
  await shot('hint-effort');
  await hint.getByRole('button',{name:'Use Low'}).click();await hint.waitFor({state:'hidden'});assert.equal(await effort(),'low');
  assert.match(await page.locator('.model-button').innerText(),/Low/);

  // Trivial ask at low effort suggests a lighter model.
  await prompt.fill('');await prompt.fill('Fix a typo in the README');await hint.waitFor();assert.match(await hint.innerText(),/Sol Mini costs less/);
  await shot('hint-model');
  // Dismiss holds for this draft, returns for a new one.
  await hint.getByRole('button',{name:'Dismiss suggestion'}).click();await hint.waitFor({state:'hidden'});await prompt.type(' now');await page.waitForTimeout(80);assert.equal(await hint.isHidden(),true);assert.equal(await model(),'sol');
  await prompt.fill('');await prompt.fill('Rename foo to bar');await hint.waitFor();
  // Complex asks get no hint.
  await prompt.fill('Refactor the auth module across all files');await page.waitForTimeout(80);assert.equal(await hint.isHidden(),true);
  await prompt.fill('');

  // Settings > Usage: counters from saved threads.
  await page.locator('.composer').evaluate(f=>f.chooseModel({effort:'high'}));
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Usage',exact:true}).click();
  const tiles=page.locator('.usage-tile');await tiles.first().waitFor();
  const read=async()=>Object.fromEntries(await tiles.evaluateAll(n=>n.map(t=>[t.querySelector('span').textContent,t.querySelector('strong').textContent])));
  assert.deepEqual(await read(),{Cost:'$0.900',Tokens:'51.8K',Turns:'5','Cache hit':'92%'});
  assert.equal(await page.locator('.usage-thread').count(),2);assert.match(await page.locator('.usage-thread').first().innerText(),/Port the billing page[\s\S]*3 turns[\s\S]*\$0\.850/);
  assert.equal(await page.locator('.usage-bar').count(),14);assert.equal(await page.locator('.usage-bar i').evaluateAll(n=>n.filter(i=>parseFloat(i.style.height)>0).length),5);
  await shot('usage-page');

  // Auto-apply is off by default; turning it on switches without a click and offers Undo.
  const auto=page.getByRole('switch',{name:'Apply suggestions automatically',exact:true});assert.equal(await auto.getAttribute('aria-checked'),'false');
  await auto.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Apply suggestions automatically"]').getAttribute('aria-checked')==='true');
  await page.locator('.settings-back,[data-action="settings"]').first().click();await prompt.waitFor();
  await prompt.fill('Explain what this function does');await hint.getByText(/Switched to Low effort/).waitFor();assert.equal(await effort(),'low');assert.equal(await model(),'sol');
  await shot('hint-auto');
  await hint.getByRole('button',{name:'Undo'}).click();await hint.waitFor({state:'hidden'});assert.equal(await effort(),'high');

  // Empty state.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:usage-report');ipcMain.handle('suffice:usage-report',()=>({total:{turns:0,cost:0,tokens:0,cacheHit:null},days:[],threads:[]}));});
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Usage',exact:true}).click();
  await page.getByText('No usage yet').waitFor();await shot('usage-empty');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
