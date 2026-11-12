import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron} from 'playwright-core';

test('thread panels, file views, tabs and drafts restore independently, including across reload', {timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-panel-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-panel-project-'));
 const git=args=>promisify(execFile)('git',['-C',cwd,...args],{windowsHide:true});
 await mkdir(resolve(cwd,'src'));await writeFile(resolve(cwd,'src','nested.ts'),'export const example = true;\n');
 for(const name of ['sample.js','sample.java','sample.pdf'])await writeFile(resolve(cwd,name),'fixture');
 await writeFile(resolve(cwd,'hello.txt'),'before\n');await git(['init','-q']);await git(['add','hello.txt']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);await writeFile(resolve(cwd,'hello.txt'),'after\n');
 const dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});
 for(const id of ['one','two']){const timestamp=new Date().toISOString();await writeFile(resolve(dir,id+'.jsonl'),[
  {type:'session',version:3,id,timestamp,cwd},
  {type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Thread '+id}],timestamp:Date.now()}},
  {type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',content:[{type:'text',text:'Reply '+id+'\n\n'+'A paragraph for checking scroll restoration.\n\n'.repeat(50)}],timestamp:Date.now(),stopReason:'stop'}},
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n');}
 const env={...process.env,SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow();await page.locator('.thread-row').filter({hasText:'Thread one'}).waitFor();
  assert.equal(await page.locator('.workspace-tools').isVisible(),false);
  const open=async id=>{await page.locator('.thread-row').filter({hasText:'Thread '+id}).click();await page.locator('.thread-header').filter({hasText:'Thread '+id}).waitFor();};
  await open('one');
  assert.equal(await page.locator('.help-button').count(),0);
  assert.equal(await page.locator('.thread-user').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('.composer').evaluate(el=>getComputedStyle(el).backgroundColor));
  assert.match(await page.locator('.thread-user').evaluate(el=>getComputedStyle(el).backdropFilter),/blur\(24px\)/);
  const size=selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return [r.width,r.height,s.padding,s.borderRadius];});
  assert.deepEqual(await size('.workspace-tools > button:last-child'),await size('.sidebar .sidebar-tools > button:last-child'));
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  const reopen=page.getByRole('button',{name:'Open sidebar',exact:true});
  assert.deepEqual(await size('.sidebar-reopen'),await size('.workspace-tools > button:last-child'));
  const alignment=await page.evaluate(()=>{const center=el=>{const r=el.getBoundingClientRect();return r.top+r.height/2;};const title=document.querySelector('.thread-header'),range=document.createRange();range.selectNodeContents(title);const r=range.getBoundingClientRect();return {reopen:center(document.querySelector('.sidebar-reopen')),window:center(document.querySelector('.workspace-tool')),title:r.y+r.height/2,titleX:r.x,buttonRight:document.querySelector('.sidebar-reopen').getBoundingClientRect().right};});
  assert.ok(Math.abs(alignment.reopen-alignment.window)<.5);assert.ok(Math.abs(alignment.title-alignment.window)<1.5);assert.ok(alignment.titleX>=alignment.buttonRight+6);
  assert.equal(await reopen.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.screenshot({path:resolve('apps/desktop/desktop-collapsed-header.png')});
  await reopen.click();
  await page.locator('#prompt').fill('Draft for one');await page.getByRole('button',{name:'Toggle right panel'}).click();
  await page.locator('.panel-launcher').getByRole('button',{name:'Files',exact:true}).click();
  const surfaces=await page.evaluate(()=>{const editor=document.querySelector('.right-panel-content'),chat=document.querySelector('.workspace');return {editor:getComputedStyle(editor).borderRadius,chat:getComputedStyle(chat).borderRadius,gap:editor.getBoundingClientRect().left-chat.getBoundingClientRect().right};});assert.equal(surfaces.editor,surfaces.chat);assert.equal(surfaces.gap,8);
  await page.getByRole('treeitem',{name:'src',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await page.getByRole('treeitem',{name:'nested.ts',exact:true}).waitFor();
  const folderStyle=element=>{const s=getComputedStyle(element),icon=element.querySelector('.icon:not(.tree-chevron)');return [s.padding,s.borderRadius,s.fontSize,s.fontWeight,s.lineHeight,s.gap,getComputedStyle(icon).width];};const filesFolderStyle=await page.getByRole('treeitem',{name:'src',exact:true}).evaluate(folderStyle);
  for(const [name,kind] of [['nested.ts','typescript'],['sample.js','javascript'],['sample.java','java'],['sample.pdf','pdf']]){const image=page.getByRole('treeitem',{name,exact:true}).locator('img');assert.match(await image.getAttribute('src'),new RegExp(kind));assert.ok(await image.evaluate(el=>el.complete&&el.naturalWidth>0));}
  await page.getByRole('treeitem',{name:'nested.ts',exact:true}).click();await page.locator('.syntax-token').first().waitFor();
  assert.match(await page.locator('.panel-code').evaluate(el=>getComputedStyle(el).fontFamily),/JetBrains Mono/);
  const color=()=>page.locator('.syntax-token').first().evaluate(el=>getComputedStyle(el).color);
  const darkColor=await color();await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.notEqual(await color(),darkColor);await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  assert.equal(await page.getByRole('treeitem',{name:'nested.ts',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Hide explorer',exact:true}).click();assert.equal(await page.locator('.editor-explorer').isVisible(),false);
  await page.getByRole('button',{name:'Show explorer',exact:true}).click();await page.getByRole('treeitem',{name:'nested.ts',exact:true}).waitFor();

  const split=page.getByRole('separator',{name:'Resize file explorer'});
  const start=Number(await split.getAttribute('aria-valuenow'));await split.focus();await split.press('ArrowRight');assert.equal(Number(await split.getAttribute('aria-valuenow')),start+8);
  const before=await page.locator('.editor-explorer').boundingBox(),grip=await split.boundingBox();await page.mouse.move(grip.x+4,grip.y+100);await page.mouse.down();await page.mouse.move(grip.x+36,grip.y+100,{steps:4});await page.mouse.up();await page.waitForFunction(width=>Math.abs(document.querySelector('.editor-explorer').getBoundingClientRect().width-width)<2,before.width+32);
  await page.getByRole('button',{name:'Filter files',exact:true}).click();
  await page.getByRole('textbox',{name:'Filter files',exact:true}).fill('nested');
  assert.equal(await page.getByRole('treeitem',{name:'hello.txt',exact:true}).isVisible(),false);
  await page.getByRole('textbox',{name:'Filter files',exact:true}).fill('');await page.getByRole('textbox',{name:'Filter files',exact:true}).press('Escape');
  await page.screenshot({path:resolve('apps/desktop/desktop-files-tree.png')});
  await page.getByRole('treeitem',{name:'hello.txt',exact:true}).click();await page.locator('.panel-code').filter({hasText:'after'}).waitFor();
  await page.getByRole('button',{name:'Add panel tab'}).click();assert.equal(await page.getByRole('menuitem',{name:'Close tab',exact:true}).count(),0);await page.getByRole('menu',{name:'Panel options'}).getByRole('menuitem',{name:'Changes',exact:true}).click();
  const tabAlignment=await page.evaluate(()=>{const cy=el=>{const r=el.getBoundingClientRect();return r.top+r.height/2;};return {window:cy(document.querySelector('.workspace-tool')),tabs:[...document.querySelectorAll('[role="tab"]')].map(cy),header:document.querySelector('.right-panel-header').getBoundingClientRect().toJSON(),controls:document.querySelector('.window-controls').getBoundingClientRect().toJSON()};});
  assert.ok(tabAlignment.tabs.every(y=>Math.abs(y-tabAlignment.window)<.5));
  assert.ok(tabAlignment.header.right<=tabAlignment.controls.x-6);
  await page.locator('.panel-path').filter({hasText:'changed files'}).waitFor();
  assert.deepEqual(await page.locator('.change-folder').first().evaluate(folderStyle),filesFolderStyle);
  await page.getByRole('menu',{name:'Panel options'}).waitFor({state:'hidden'});
  await page.screenshot({path:resolve('apps/desktop/desktop-changes-list.png')});
  await page.locator('.panel-file-row').filter({hasText:'hello.txt'}).click();await page.locator('.panel-code .addition').filter({hasText:'+after'}).waitFor();
  await page.locator('.thread-transcript').evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));el.scrollTop=100;});
  await open('two');assert.equal(await page.locator('#prompt').inputValue(),'');assert.equal(await page.locator('#right-sidebar').getAttribute('aria-hidden'),'true');
  await page.locator('#prompt').fill('Draft for two');
  await open('one');assert.equal(await page.locator('#prompt').inputValue(),'Draft for one');
  assert.equal(await page.getByRole('tab',{name:'Changes',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.getByRole('tab',{name:'Files',exact:true}).count(),1);await page.locator('.panel-code .addition').filter({hasText:'+after'}).waitFor();
  await page.waitForFunction(()=>Math.abs(document.querySelector('.thread-transcript').scrollTop-100)<2);
  await page.screenshot({path:resolve('apps/desktop/desktop-panel-changes.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:resolve('apps/desktop/desktop-panel-changes-light.png')});
  await page.getByRole('button',{name:'New session',exact:true}).click();assert.equal(await page.locator('.workspace-tools').isVisible(),false);assert.equal(await page.locator('#right-sidebar').getAttribute('aria-hidden'),'true');
  await page.locator('#prompt').fill('New thread draft');await open('two');assert.equal(await page.locator('#prompt').inputValue(),'Draft for two');
  await page.getByRole('button',{name:'New session',exact:true}).click();assert.equal(await page.locator('#prompt').inputValue(),'New thread draft');
  await page.reload();await page.locator('.thread-row').filter({hasText:'Thread one'}).waitFor();await open('one');assert.equal(await page.locator('#prompt').inputValue(),'Draft for one');assert.equal(await page.getByRole('tab',{name:'Changes',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Files',exact:true}).click();await page.locator('.panel-code').filter({hasText:'after'}).waitFor();
  await page.getByRole('tab',{name:'Files',exact:true}).hover();await page.getByRole('button',{name:'Close Files tab'}).click();assert.equal(await page.getByRole('tab',{name:'Files',exact:true}).count(),0);await page.getByRole('tab',{name:'Changes',exact:true}).hover();await page.getByRole('button',{name:'Close Changes tab'}).click();assert.equal(await page.getByRole('button',{name:'Add panel tab'}).isVisible(),false);assert.equal(await page.locator('.panel-launcher').isVisible(),true);
 }finally{await app.close();}
});
