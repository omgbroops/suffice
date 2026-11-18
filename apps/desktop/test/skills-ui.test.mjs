import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const shots=process.env.SKILLS_SHOTS;
test('skills library: create, edit, delete in Settings, then attach from the composer + menu',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-skills-ui-')),project=await mkdtemp(resolve(tmpdir(),'suffice-skills-proj-'));
 if(shots)await mkdir(shots,{recursive:true});
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:'sfx-agent-skills',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-skills-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 const stderr=[];app.process().stderr.on('data',d=>stderr.push(String(d)));
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.composer').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const shot=async name=>{if(!shots)return;for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(150);await page.screenshot({path:resolve(shots,`${name}-${theme}.png`)});}};
  await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Skills',exact:true}).click();
  for(const name of ['Code review','Write tests','Explain codebase','Fix CI'])await page.getByText(name,{exact:true}).first().waitFor();
  await shot('settings-skills');
  await page.getByRole('button',{name:'New skill',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'New skill'});
  await dialog.getByLabel('Name',{exact:true}).fill('Style guide');await dialog.getByLabel('Description').fill('House rules');await dialog.getByLabel('Instructions').fill('Use tabs.');
  await dialog.locator('input[type=file]').setInputFiles({name:'rules.txt',mimeType:'text/plain',buffer:Buffer.from('no semicolons')});
  await dialog.getByText('rules.txt').waitFor();await shot('skill-editor');
  await dialog.getByRole('button',{name:'Save'}).click();await page.getByText('House rules').waitFor();
  const library=JSON.parse(await readFile(resolve(home,'skill-library.json'),'utf8'));assert.equal(library.user.at(-1).files[0].text,'no semicolons');
  await page.getByRole('button',{name:'New project skill',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'New project skill'});await dialog.getByLabel('Name',{exact:true}).fill('Repo notes');await dialog.getByLabel('Instructions').fill('Run bun test.');await dialog.getByRole('button',{name:'Save'}).click();
  await page.getByText('Project · No description').waitFor();
  const row=page.locator('.settings-option',{hasText:'Style guide'});await row.getByRole('button',{name:'Edit'}).click();
  dialog=page.getByRole('dialog',{name:'Edit Style guide'});await dialog.getByLabel('Description').fill('Updated rules');await dialog.getByRole('button',{name:'Save'}).click();await page.getByText('Updated rules').waitFor();
  await shot('settings-skills-after');
  const del=page.locator('.settings-option',{hasText:'Fix CI'}).getByRole('button',{name:'Delete'});await del.click();await del.getByText;await page.locator('.settings-option',{hasText:'Fix CI'}).getByRole('button',{name:'Confirm delete'}).click();
  await page.waitForFunction(()=>![...document.querySelectorAll('.settings-option-label')].some(e=>e.textContent==='Fix CI'));
  // Composer: attach from the + menu.
  await page.getByRole('button',{name:'Back to chats'}).click();
  await page.getByRole('button',{name:'Add attachment'}).click();
  const skills=page.getByRole('menuitem',{name:'Skills',exact:true});await skills.click();
  await page.getByRole('menuitemradio',{name:'Code review'}).waitFor();await shot('composer-menu');
  await page.getByRole('menuitemradio',{name:'Code review'}).click();
  await page.locator('.skill-chip',{hasText:'Code review'}).waitFor();
  await page.getByRole('button',{name:'Add attachment'}).click();await page.getByRole('menuitem',{name:'Skills',exact:true}).click();
  assert.equal(await page.getByRole('menuitemradio',{name:'Code review'}).getAttribute('aria-checked'),'true');
  await page.getByRole('menuitemradio',{name:'Repo notes'}).click();
  assert.equal(await page.evaluate(()=>document.querySelector('.composer').skills.ids().length),2);
  await shot('composer-chips');
  await page.getByRole('button',{name:'Remove skill Code review'}).click();
  assert.equal(await page.locator('.skill-chip').count(),1);
  assert.deepEqual(errors,[]);assert.equal(stderr.join('').includes('[no-dialog]'),false,stderr.join(''));
 }finally{await app.close();}
});
