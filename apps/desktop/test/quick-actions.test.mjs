import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launchQuick,openThread} from './quick-actions-lib.mjs';
import {fuzzyScore,fuzzyRank} from '../src/fuzzy.js';
import {messageAsMarkdown} from '../src/message-export.js';

test('fuzzy ranking prefers file names, boundaries and consecutive letters',()=>{
 assert.equal(fuzzyScore('zzz','src/app.js'),-1);
 assert.deepEqual(fuzzyRank(['docs/composer-notes.md','src/composer.js','src/app.js'],'comp',p=>p,2),['src/composer.js','docs/composer-notes.md']);
 assert.equal(fuzzyRank(['README.md','src/readme-x.js'],'rdm',p=>p)[0],'README.md');
});
test('copy as markdown labels the role and lists attachments',()=>{
 assert.equal(messageAsMarkdown('user','Hi  ',[{name:'a.png'}]),'### You\n\nHi\n\n- a.png\n');
 assert.equal(messageAsMarkdown('assistant','Done.'),'### Suffice\n\nDone.\n');
});

test('quick actions: slash commands, mentions, drop, markdown copy and edit-and-resend work from the keyboard',{timeout:180000},async t=>{
 const {app,page,folder}=await launchQuick(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const prompt=page.locator('#prompt'),menu=page.locator('.composer-suggest'),options=()=>menu.getByRole('option');
 const visible=()=>menu.waitFor({state:'visible'}),gone=()=>menu.waitFor({state:'hidden'});
 try{
  await openThread(page,'First question');
  await t.test('slash menu lists commands and filters as you type',async()=>{
   await prompt.click();await page.keyboard.type('/');await visible();
   assert.deepEqual(await options().allInnerTexts().then(list=>list.map(x=>x.split('\n')[0])),['/model','/effort','/clear','/fork','/review','/test']);
   await page.keyboard.press('ArrowDown');assert.equal(await menu.locator('[data-active]').first().innerText().then(x=>x.split('\n')[0]),'/effort');
   await page.keyboard.press('Escape');await gone();assert.equal(await prompt.inputValue(),'/');
   await page.keyboard.type('x');await prompt.fill('');
  });
  await t.test('/effort and /model change the composer selection',async()=>{
   await prompt.fill('/ef');await visible();await page.keyboard.press('Enter');assert.equal(await prompt.inputValue(),'/effort ');
   await menu.getByRole('option').first().waitFor();assert.equal(await options().count(),3);
   await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await gone();
   assert.equal(await page.locator('.composer').evaluate(f=>f.modelSelection.effort),'medium');assert.equal(await prompt.inputValue(),'');
   await prompt.fill('/model gr');await options().first().waitFor();await page.keyboard.press('Enter');
   assert.deepEqual(await page.locator('.composer').evaluate(f=>({m:f.modelSelection.model,e:f.modelSelection.effort})),{m:'grok-fixture',e:'medium'.length?'high':''}.m?{m:'grok-fixture',e:'low'}:{});
  });
  await t.test('/review and /test fill the composer without sending',async()=>{
   const before=await page.locator('.thread-user').count();
   await prompt.fill('/rev');await visible();await page.keyboard.press('Enter');assert.match(await prompt.inputValue(),/^Review the uncommitted changes/);
   await prompt.fill('/test');await visible();await page.keyboard.press('Enter');assert.match(await prompt.inputValue(),/^Run this project's tests/);
   assert.equal(await page.locator('.thread-user').count(),before);await prompt.fill('');
  });
  await t.test('@ mentions fuzzy-search files and threads',async()=>{
   await prompt.click();await page.keyboard.type('see @cmps');await visible();
   assert.match(await options().first().innerText(),/composer\.js[\s\S]*src/);await page.keyboard.press('Enter');assert.equal(await prompt.inputValue(),'see @src/composer.js ');
   await page.keyboard.type('and @unrel');await options().filter({hasText:'Unrelated planning thread'}).waitFor();await page.keyboard.press('Enter');
   assert.equal(await prompt.inputValue(),'see @src/composer.js and @"Unrelated planning thread" ');
   await prompt.fill('@rdm');await visible();assert.match(await options().first().innerText(),/README\.md/);await page.keyboard.press('Escape');await prompt.fill('');
  });
  await t.test('dropping files anywhere in the workspace attaches them',async()=>{
   await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File(['hello'],'note.txt',{type:'text/plain'}));const zone=document.querySelector('.thread-transcript');zone.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:dt}));window.__dt=dt;});
   assert.ok(await page.locator('.composer.attachment-drag').count());
   await page.evaluate(()=>document.querySelector('.thread-transcript').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__dt})));
   await page.locator('.attachment-tray .attachment-card').waitFor();assert.equal(await page.locator('.composer.attachment-drag').count(),0);
   await page.locator('.attachment-tray .attachment-remove').dispatchEvent('click');
  });
  await t.test('copy as Markdown works for user and agent messages',async()=>{
   const bar=page.locator('.message-toolbar'),copy=async(target,name)=>{await target.hover();await bar.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(250);return app.evaluate(({clipboard})=>clipboard.readText());};
   assert.equal(await copy(page.locator('.thread-user').last(),'Copy as Markdown'),'### You\n\nSecond question\n');
   assert.equal(await copy(page.locator('.thread-assistant').last(),'Copy as Markdown'),'### Suffice\n\nAnswer two.\n');
  });
  await t.test('edit-and-resend branches before the last user message and leaves the source untouched',async()=>{
   const source=resolve(folder,'a.jsonl'),before=await readFile(source,'utf8'),bar=page.locator('.message-toolbar');
   await page.locator('.thread-user').first().hover();assert.equal(await bar.getByRole('button',{name:'Edit and resend'}).count(),0);
   await page.locator('.thread-user').last().hover();await bar.getByRole('button',{name:'Edit and resend'}).click();
   await page.waitForFunction(()=>document.querySelector('#prompt').value==='Second question');
   await page.waitForFunction(()=>document.querySelectorAll('.thread-user').length===1);
   assert.equal(await page.locator('.thread-user').first().innerText(),'First question');assert.equal(await readFile(source,'utf8'),before);
   assert.equal(await page.locator('.thread-row').count(),3);
   // Keyboard path: from the original thread, Mod+Up in an empty composer does the same.
   await openThread(page,'First question');await prompt.fill('');await prompt.focus();await page.keyboard.press('ControlOrMeta+ArrowUp');
   await page.waitForFunction(()=>document.querySelector('#prompt').value==='Second question'&&document.querySelectorAll('.thread-user').length===1);
   assert.equal(await page.locator('.thread-row').count(),4);
  });
  await t.test('/fork and /clear act on the open thread',async()=>{
   await openThread(page,'First question');const rows=await page.locator('.thread-row').count();
   await prompt.fill('/fork');await visible();await page.keyboard.press('Enter');
   await page.waitForFunction(n=>document.querySelectorAll('.thread-row').length>n,rows);
   await prompt.fill('/clear');await visible();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>!document.querySelector('.workspace').classList.contains('thread-view'));
  });
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
