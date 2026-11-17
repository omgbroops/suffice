import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
const {windowChrome}=createRequire(import.meta.url)('../electron/window-chrome.cjs');

test('macOS uses native traffic lights; the development preview never spoofs the platform',()=>{
 assert.deepEqual(windowChrome({platform:'darwin'}),{mode:'macos-native',options:{frame:true,titleBarStyle:'hidden',trafficLightPosition:{x:16,y:19}}});
 assert.deepEqual(windowChrome({platform:'win32',preview:'macos'}),{mode:'macos-preview',options:{frame:false}});
 assert.equal(windowChrome({platform:'win32',preview:'macos',packaged:true}).mode,'windows');
 assert.equal(windowChrome({platform:'linux',preview:'invalid'}).mode,'windows');
});

test('caption layout reserves wordmark space, clamps old widths, and keeps the left cutout when collapsed',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-caption-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString();await writeFile(resolve(dir,'chat.jsonl'),[{type:'session',version:3,id:'caption',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Caption fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_WINDOW_CHROME:'macos'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{
  const page=await app.firstWindow();await page.locator('.window-controls button').first().waitFor();await page.evaluate(()=>localStorage.setItem('suffice-sidebar-width','190'));await page.reload();await page.locator('.window-controls button').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-window-chrome'),'macos-preview');
  const separator=page.getByRole('separator',{name:'Resize sidebar',exact:true});assert.equal(await separator.getAttribute('aria-valuemin'),'280');assert.equal(await page.locator('.sidebar').evaluate(el=>el.offsetWidth),280);
  const bounds=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {lights:box('.window-controls'),brand:box('.sidebar-heading .brand-wordmark'),tools:box('.sidebar-heading .sidebar-tools')};});assert.ok(bounds.brand.left>=bounds.lights.right);assert.ok(bounds.brand.right<bounds.tools.left);assert.ok(bounds.tools.right<=280);
  assert.deepEqual(await page.locator('.window-controls button').evaluateAll(buttons=>buttons.map(button=>button.dataset.window)),['close','minimize','maximize']);await separator.press('Home');await separator.press('ArrowLeft');assert.equal(await page.locator('.sidebar').evaluate(el=>el.offsetWidth),280);
  await page.screenshot({path:resolve(home,'mac-controls-expanded-dark.png')});
  await page.locator('.thread-row').first().click();await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).waitFor({state:'visible'});
  const collapsed=await page.evaluate(()=>{const chrome=document.querySelector('.window-controls'),reopen=document.querySelector('.sidebar-reopen');return {bg:getComputedStyle(chrome).backgroundColor,sidebar:getComputedStyle(document.querySelector('.sidebar')).backgroundColor,join:getComputedStyle(chrome,'::before').display,reopen:reopen.getBoundingClientRect().left,edge:getComputedStyle(chrome.querySelector('.window-control-edge')).borderRightWidth};});assert.equal(collapsed.bg,collapsed.sidebar);assert.equal(collapsed.join,'block');assert.ok(collapsed.reopen>=88);assert.notEqual(collapsed.edge,'0px');
  await page.screenshot({path:resolve(home,'mac-controls-collapsed-dark.png')});await page.getByRole('button',{name:'Toggle right panel',exact:true}).click();assert.equal(await page.locator('.window-controls').evaluate(el=>getComputedStyle(el,'::before').display),'block');await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:resolve(home,'mac-controls-collapsed-light.png')});
  await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'General',exact:true}).waitFor();await page.screenshot({path:resolve(home,'mac-controls-settings-light.png')});
  await page.getByRole('button',{name:'Maximize or restore',exact:true}).click();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()),true);await page.getByRole('button',{name:'Maximize or restore',exact:true}).click();await page.getByRole('button',{name:'Minimize',exact:true}).click();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),true);await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.restore();win.show();});
  console.log('Caption screenshots:',home);
 }finally{await app.close();}
});
