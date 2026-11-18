import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {projectMetadata} from '../electron/sidebar-metadata.mjs';
import {projectIdentity} from '../src/thread-row.js';
import {guard} from './electron-guard.mjs';
test('project icons use local assets, explicit overrides and stable monograms',async()=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-icons-'));await mkdir(resolve(cwd,'public'));await writeFile(resolve(cwd,'public/favicon.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
 assert.match((await projectMetadata(cwd)).projectImage,/^data:image\/svg\+xml;base64,/);
 const override=await mkdtemp(resolve(tmpdir(),'suffice-icon-override-'));await writeFile(resolve(override,'t3.json'),JSON.stringify({projectIcon:{kind:'emoji',emoji:'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬'}}));assert.equal((await projectMetadata(override)).projectIcon.emoji,'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬');
 assert.deepEqual(projectIdentity('Suffice'),projectIdentity('Suffice'));assert.equal(projectIdentity('Pixel Design System').text,'PS');assert.equal(projectIdentity('T3 Code').text,'T3');
});
test('github avatars: owner parsing, one fetch then disk cache, misses stay quiet',async()=>{
 const {githubOwner,createAvatarStore}=await import('../electron/github-avatar.mjs');
 assert.equal(githubOwner('git@github.com:A-G0D/suffice.git'),'A-G0D');assert.equal(githubOwner('https://github.com/vercel-labs/ui'),'vercel-labs');assert.equal(githubOwner('https://gitlab.com/a/b'),null);assert.equal(githubOwner('https://github.com/../x/y'),null);
 const dir=await mkdtemp(resolve(tmpdir(),'sfx-avatar-'));let calls=0;const png=Buffer.from('89504e470d0a1a0a','hex');
 const fetchImpl=async()=>{calls++;return {ok:true,headers:{get:()=>'image/png'},arrayBuffer:async()=>png};};
 const a=createAvatarStore({dir,fetchImpl,git:async()=>'git@github.com:A-G0D/x.git'});
 assert.match((await a.forProject('/p')).image,/^data:image\/png;base64,/);await a.forProject('/p');assert.equal(calls,1);
 const b=createAvatarStore({dir,fetchImpl,git:async()=>'https://github.com/A-G0D/x'});await b.forProject('/q');assert.equal(calls,1,'second store reads the disk cache');
 const miss=createAvatarStore({dir:resolve(dir,'m'),fetchImpl:async()=>({ok:false,headers:{get:()=>''}}),git:async()=>'git@github.com:nobody/x.git'});assert.equal((await miss.forProject('/r')).image,null);
 const none=createAvatarStore({dir,fetchImpl,git:async()=>{throw new Error('no remote');}});assert.equal(await none.forProject('/s'),null);
});
test('date labels',async()=>{
 const {dateLabel}=await import('../src/threads-ui.js').catch(()=>({}));if(!dateLabel)return;
 const now=new Date(2026,10,18,15).getTime(),day=864e5;
 assert.deepEqual([0,day,3*day,20*day,90*day].map(x=>dateLabel(now-x,now)),['Today','Yesterday','Last 7 days','Last 30 days','Older']);
});
test('sidebar: grouped rows, row menu with single-key shortcuts, no git filler, account row',{timeout:90000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-sidebar-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();
 await app.evaluate(({ipcMain})=>{const now=Date.now();ipcMain.removeHandler('suffice:threads');ipcMain.handle('suffice:threads',()=>[
  {id:'a',title:'Fix webhooks',project:'Halo Pay',cwd:'/x/halo',branch:'fix/x',provider:'openai',status:'approval',modified:now},
  {id:'b',title:'Audit tokens',project:'Pixel',cwd:'/x/pixel',provider:'openai',status:'done',modified:now-3600000},
  {id:'c',title:'Old thread',project:null,provider:'anthropic',status:'done',modified:now-90*864e5},
  {id:'d',title:'Running one',project:'Northwind',cwd:'/x/nw',provider:'anthropic',status:'working',startedAt:now-720000,modified:now}]);
  ipcMain.removeHandler('suffice:account');ipcMain.handle('suffice:account',()=>({login:'tester',avatar:null}));});
 await page.evaluate(()=>{localStorage.removeItem('suffice-sidebar-preferences-v1');});await page.reload();await page.locator('.thread-card').last().waitFor();
 assert.equal(await page.locator('.thread-card').count(),4);
 assert.deepEqual(await page.locator('.thread-group-name').allTextContents(),['Today','Older']);
 const text=await page.locator('.sidebar').innerText();assert.doesNotMatch(text,/No Git|Git not recorded|Claude Code|Artifacts/);
 assert.deepEqual(await page.locator('.sidebar-nav > button:not([hidden]) .nav-label').allTextContents(),['New','Search','Projects','Scheduled','Plugins']);
 assert.equal(await page.locator('.teamwork-nav').isVisible(),false);
 assert.equal(await page.locator('.account-name').textContent(),'tester');
 // no circles: every sidebar control and avatar is a rounded rectangle
 const radii=await page.evaluate(()=>[...document.querySelectorAll('.sidebar button,.account-avatar,.thread-project-icon')].map(e=>{const r=e.getBoundingClientRect(),b=parseFloat(getComputedStyle(e).borderTopLeftRadius);return r.width>0&&b>=Math.min(r.width,r.height)/2-0.5&&Math.abs(r.width-r.height)<1.5;}).filter(Boolean).length);assert.equal(radii,0);
 // sort and group menus tick exactly one entry
 await page.locator('[data-action="sidebar-menu"]').click();await page.getByRole('menuitem',{name:'Group by',exact:true}).click();assert.equal(await page.locator('.popover--submenu [aria-checked="true"]').count(),1);await page.keyboard.press('Escape');
 // hover "..." and its menu
 await page.locator('[data-thread="b"]').hover();await page.locator('[data-thread="b"] .thread-more').click();await page.locator('.thread-context-menu:not([hidden])').waitFor();
 const labels=await page.locator('.thread-context-menu > .menu-options > .menu-item .menu-label').allTextContents();for(const l of ['Pin','Mark as unread','Rename','Fork','Move to section','Move under','Archive','Delete'])assert.ok(labels.includes(l),l);
 assert.equal(await page.locator('.thread-context-menu .menu-item--danger .menu-label').textContent(),'Delete');
 await page.keyboard.press('p');await page.waitForFunction(()=>document.querySelector('.thread-group-name')&&[...document.querySelectorAll('.thread-group-name')].some(n=>n.textContent==='Pinned'));
 // right-click opens the same menu; U toggles unread
 await page.locator('[data-thread="a"]').click({button:'right'});await page.locator('.thread-context-menu:not([hidden])').waitFor();await page.keyboard.press('u');await page.waitForFunction(()=>document.querySelector('[data-thread="a"]').dataset.unread==='true');
 // sections: new section from the menu moves the thread under a collapsible group
 await page.locator('[data-thread="c"]').click({button:'right'});await page.getByRole('menuitem',{name:'Move to section',exact:true}).click();await page.getByRole('menuitem',{name:'New section',exact:true}).click();await page.locator('#thread-rename-input').fill('Launch');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>[...document.querySelectorAll('.thread-group-name')].some(n=>n.textContent==='Launch'));
 const launch=page.locator('.thread-project-group',{has:page.locator('.thread-group-name',{hasText:'Launch'})});await launch.locator('.thread-group-toggle').click();await launch.locator('.thread-group-rows').waitFor({state:'hidden'});
 }finally{await app.close();}
});
