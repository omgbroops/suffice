import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';

test('composer attachments, preview menus, persisted defaults and background sends', {timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-composer-')),env=testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'});
 const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.locator('.composer').waitFor();
  await page.waitForFunction(()=>document.querySelector('.atmosphere')?.dataset.background==='lake');
  assert.equal(await page.evaluate(()=>localStorage.getItem('suffice-theme')),'dark');assert.equal(await page.evaluate(()=>localStorage.getItem('suffice-background')),'lake');
  assert.equal(await page.locator('[data-action="agent-menu"],[data-action="shortcuts"]').count(),0);
  assert.equal(await page.getByRole('button',{name:'Inbox',exact:true}).count(),0);await page.getByRole('button',{name:'Search sessions',exact:true}).click();await page.getByRole('textbox',{name:'Search sessions',exact:true}).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Workspace options',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'Search sessions',exact:true}).count(),0);await page.getByRole('menuitem',{name:'Background',exact:true}).hover();await page.getByRole('menuitemradio',{name:'None',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.workspace').classList.contains('background-none'));await page.reload();await page.waitForFunction(()=>document.querySelector('.atmosphere')?.dataset.background==='none');assert.equal(await page.locator('.thread-atmosphere').isVisible(),false);
  await page.getByRole('button',{name:'Workspace options',exact:true}).click();await page.getByRole('menuitem',{name:'Background',exact:true}).hover();await page.getByRole('menuitemradio',{name:'Moonlit lake',exact:true}).click();
  const square=selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return [r.width,r.height];});assert.deepEqual(await square('[data-action="attach"]'),[28,28]);
  const promptSize=()=>page.locator('#prompt').evaluate(el=>el.getBoundingClientRect().height);const initialHeight=await promptSize();
  await page.locator('#prompt').fill('A line of text.\n'.repeat(8));await page.waitForFunction(()=>document.querySelector('#prompt').getBoundingClientRect().height>100);assert.ok(await promptSize()>initialHeight);await page.locator('#prompt').fill('A long message.\n'.repeat(100));await page.waitForFunction(()=>getComputedStyle(document.querySelector('#prompt')).overflowY==='auto');assert.ok(await promptSize()<=280);await page.locator('#prompt').fill('');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
  const image=resolve(home,'image.png'),pdf=resolve(home,'Article.pdf');await writeFile(image,png);await writeFile(pdf,'%PDF-fixture');
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add attachment'}).click();await (await chooser).setFiles([image,pdf]);
  await page.getByRole('button',{name:'Preview image.png'}).waitFor();assert.match(await page.locator('.attachment-info').innerText(),/Article.pdf\n\d+ B/);assert.equal(await page.locator('.toast').isVisible(),false);
  await page.screenshot({path:resolve('apps/desktop/desktop-attachments-mixed.png')});
  await page.getByRole('button',{name:'Preview image.png'}).click();await page.getByRole('dialog',{name:'Image preview'}).waitFor();assert.equal(await page.locator('.image-preview select').count(),0);assert.equal(await page.getByRole('link',{name:'Download image'}).count(),0);
  await page.getByRole('button',{name:'Image zoom',exact:true}).click();await page.getByRole('menuitemradio',{name:'200%',exact:true}).click();assert.match(await page.getByRole('button',{name:'Image zoom',exact:true}).innerText(),/200%/);await page.screenshot({path:resolve('apps/desktop/desktop-image-preview.png')});await page.getByRole('button',{name:'Close image preview'}).click();
  await page.locator('.attachment-card').filter({hasText:'Article.pdf'}).hover();await page.getByRole('button',{name:'Remove Article.pdf'}).click();assert.equal(await page.locator('.attachment-card').count(),1);
  await page.locator('#prompt').evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['pasted text'],'pasted.txt',{type:'text/plain'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});assert.equal(await page.locator('.attachment-card').count(),2);
  await page.locator('#prompt').evaluate(el=>{const data=new DataTransfer();for(let i=0;i<12;i++)data.items.add(new File(['text'],'attachment-'+i+'.txt',{type:'text/plain'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>document.querySelector('.attachment-tray').dataset.moreRight==='true');assert.ok(await page.locator('.attachment-tray').evaluate(el=>el.clientHeight<75&&el.scrollWidth>el.clientWidth));await page.locator('.attachment-tray').evaluate(el=>el.scrollLeft=80);await page.waitForFunction(()=>document.querySelector('.attachment-tray').dataset.moreLeft==='true');
  for(let i=0;i<12;i++){await page.locator('.attachment-tray').evaluate(el=>el.scrollLeft=el.scrollWidth);const remove=page.getByRole('button',{name:'Remove attachment-'+i+'.txt',exact:true});await remove.evaluate(el=>el.click());}
  await page.reload();await page.getByRole('button',{name:'Preview image.png'}).waitFor();assert.equal(await page.locator('.attachment-card').count(),2);assert.equal(await page.locator('.atmosphere').getAttribute('data-background'),'lake');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('suffice:run-background');ipcMain.handle('suffice:run-background',(_event,payload)=>{globalThis.sentBackground=payload;return new Promise(resolve=>{globalThis.finishBackground=resolve;});});});
  // a real send needs a project; pick one the way a user does (sign-in comes from the fake harness)
  const project=await mkdtemp(resolve(tmpdir(),'suffice-composer-project-'));await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},project);
  await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.getByRole('button',{name:'New project',exact:true}).click();await page.locator('.git-pill:not(.sign-in-pill)').waitFor();
  const prompt=page.locator('#prompt');await prompt.fill('Background fixture');const arrow=await page.locator('.send-button').innerHTML();await prompt.focus();await page.keyboard.down('Control');assert.equal(await page.locator('.send-button').innerHTML(),arrow);await page.keyboard.press('Enter');await page.keyboard.up('Control');
  await page.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(await page.locator('.workspace').evaluate(el=>el.classList.contains('thread-view')),false);
  const sent=await app.evaluate(()=>globalThis.sentBackground);assert.equal(sent.prompt,'Background fixture');assert.equal(sent.attachments.length,2);assert.equal(sent.attachments[0].type,'image/png');
  await app.evaluate(()=>globalThis.finishBackground({threadId:'fixture'}));
  await prompt.fill('Menu fixture');await page.getByRole('button',{name:'Session options'}).click();assert.equal(await page.locator('#popover [role="menuitem"]').count(),1);await page.getByRole('menuitem',{name:'Start session in background',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal((await app.evaluate(()=>globalThis.sentBackground)).prompt,'Menu fixture');await app.evaluate(()=>globalThis.finishBackground({threadId:'fixture'}));
  await page.screenshot({path:resolve('apps/desktop/desktop-composer-refined.png')});assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
