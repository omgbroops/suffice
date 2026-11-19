import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {deflateSync,crc32} from 'node:zlib';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';
// Cursor overlay, driven like a person: Option+Space (fake shortcut registry, no real key hook), tap Option to type, answer streams into the pill,
// the canned point becomes a ring at the mapped screen spot, "remind me" lands in the sidebar and fires a notification. Every window stays hidden;
// capture is a PNG (SUFFICE_TEST_SCREEN_IMAGE) and the model is a fake (SUFFICE_TEST_OVERLAY_RUNNER). OVERLAY_SHOT_DIR + OVERLAY_SHOT_THEME save screenshots.
function png(width,height){
 const rows=[];for(let y=0;y<height;y++){const row=Buffer.alloc(1+width*3);for(let x=0;x<width;x++){const bar=y>24&&y<40&&x>30&&x<260,card=y>70&&y<170&&x>30&&x<width-30,btn=y>280&&y<320&&x>440&&x<520;const v=bar?220:btn?120:card?58:28+Math.round(y/height*18);row[1+x*3]=v;row[2+x*3]=v;row[3+x*3]=card||btn?v+10:v;}rows.push(row);}
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc32(body),8+data.length);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
async function launch(){
 const root=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-overlay-')));
 const home=resolve(root,'suffice-home'),fakeHome=resolve(root,'home'),project=resolve(root,'project'),image=resolve(root,'screen.png');
 for(const dir of [home,fakeHome,project])await mkdir(dir);
 await writeFile(image,png(640,400));
 const env={PATH:process.env.PATH,HOME:fakeHome,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_START_PROJECT:project,SUFFICE_SESSIONS_SOCKET:'sfx-fr-cursor-agent-overlay-'+process.pid,SUFFICE_HISTORY_HOME:resolve(root,'history'),SUFFICE_TEST_SCREEN_STATUS:'granted',SUFFICE_TEST_SCREEN_IMAGE:image,SUFFICE_TEST_OVERLAY_RUNNER:resolve('apps/desktop/test/overlay-runner.cjs'),SUFFICE_TEST_OPTION_TAP:'off'};
 const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop/test/ask-bar-hidden-main.cjs'),'--user-data-dir='+resolve(root,'electron'),'--mute-audio'],env});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push('main: '+e.message));await page.locator('.composer').waitFor();
 const theme=process.env.OVERLAY_SHOT_THEME||'dark';
 await page.evaluate(t=>{localStorage.setItem('suffice-theme',t);document.documentElement.dataset.theme=t;},theme);
 return {app,page,errors};
}
const overlayPage=async app=>{for(let i=0;i<100;i++){const p=app.windows().find(w=>w.url().includes('overlay.html'));if(p)return p;await new Promise(r=>setTimeout(r,100));}throw new Error('overlay window never opened');};
const shot=async(page,name)=>{if(!process.env.OVERLAY_SHOT_DIR)return;await page.waitForTimeout(900);await page.screenshot({path:resolve(process.env.OVERLAY_SHOT_DIR,name+'.png')});};
// Test render only: the overlay is transparent over the desktop, so a stand-in wallpaper makes the screenshot readable.
const wallpaper=page=>process.env.OVERLAY_SHOT_DIR?page.addStyleTag({content:'html,body.overlay-window{background:linear-gradient(135deg,#27313f,#4b3d52 55%,#6b4a3a)!important}'}):null;

test('overlay: open, type, reply streams, ring lands, reminder fires',async()=>{
 const {app,page,errors}=await launch();
 try{
  await page.evaluate(()=>window.sufficeDesktop.desktopPreference({id:'local-agent',value:true}));
  await page.waitForFunction(()=>true);
  for(let i=0;i<50&&!(await app.evaluate(()=>globalThis.shortcuts.has('Option+Space')));i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(await app.evaluate(()=>globalThis.shortcuts.has('Option+Space')),true,'fallback shortcut registered when no key helper runs');
  await app.evaluate(()=>globalThis.shortcuts.get('Option+Space')());
  const o=await overlayPage(app);await wallpaper(o);
  await o.locator('.ov-pill').waitFor();
  const flags=await app.evaluate(()=>{const w=globalThis.sufficeTestOverlay.window.window();return {focusable:w.isFocusable(),top:w.isAlwaysOnTop?.()??null,bounds:w.getBounds()};});
  assert.equal(flags.focusable,false,'overlay never takes focus until typing');
  await shot(o,'1-ready');
  // tap Option (down+up inside the hold time) = type mode
  await app.evaluate(()=>{const f=globalThis.sufficeTestOverlay.flow;f.onKey('option','down',0);f.onKey('option','up',60);});
  await o.locator('.ov-field input').waitFor();
  assert.equal(await app.evaluate(()=>globalThis.sufficeTestOverlay.window.window().isFocusable()),true);
  await shot(o,'2-typing');
  await o.locator('.ov-field input').fill('where is the save button');
  await o.locator('.ov-field input').press('Enter');
  await o.locator('.ov-text').filter({hasText:'bottom right'}).waitFor();
  const payload=await app.evaluate(()=>globalThis.overlayPayloads.at(-1));
  assert.match(payload.prompt,/^where is the save button/);
  assert.ok(payload.attachments?.[0]?.data?.length>100,'screenshot is attached');
  assert.match(payload.prompt,/640x400 px/);
  const ring=o.locator('[data-role=ring]');await ring.waitFor();
  await o.locator('[data-role=ring-label]').filter({hasText:'Save'}).waitFor();
  // ring lands where the mapper says: image (480,300) of 640x400 mapped over the display, relative to the overlay window origin
  const want=await app.evaluate(({screen})=>{const b=screen.getPrimaryDisplay().bounds;return {x:Math.round(480*b.width/640),y:Math.round(300*b.height/400)};});
  const got=await o.evaluate(()=>{const r=document.querySelector('[data-role=ring]');return {x:parseFloat(r.style.left),y:parseFloat(r.style.top)};});
  assert.deepEqual(got,want);
  assert.equal(await o.locator('#overlay').getAttribute('data-ring'),`${want.x},${want.y}`);
  await shot(o,'3-ring');
  // a point on another display (wrong displayId) draws nothing
  assert.equal(await app.evaluate(async()=>globalThis.sufficeTestOverlay.window.ring({x:9999,y:1},'x')),null);
  // double-tap Option while open closes it
  await app.evaluate(()=>globalThis.shortcuts.get('Option+Space')());
  for(let i=0;i<30&&await app.evaluate(()=>globalThis.sufficeTestOverlay.window.isOpen());i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(await app.evaluate(()=>globalThis.sufficeTestOverlay.window.isOpen()),false);

  // remind me: stored, listed in the sidebar, notification fires
  await app.evaluate(()=>globalThis.shortcuts.get('Option+Space')());
  const o2=await overlayPage(app);await wallpaper(o2);await o2.locator('.ov-pill').waitFor();
  await app.evaluate(()=>{const f=globalThis.sufficeTestOverlay.flow;f.onKey('option','down',0);f.onKey('option','up',60);});
  await o2.locator('.ov-field input').fill('remind me to call mum in 1 second');
  await o2.locator('.ov-field input').press('Enter');
  await o2.locator('.ov-text').filter({hasText:'Reminder set'}).waitFor();
  await shot(o2,'4-reminder');
  const before=await app.evaluate(()=>(globalThis.overlayPayloads||[]).length);
  assert.equal(before,1,'a reminder is not sent to the model');
  await page.locator('.reminder-row').filter({hasText:'call mum'}).waitFor();
  for(let i=0;i<40&&!(await app.evaluate(()=>(globalThis.sufficeTestNotifications||[]).some(n=>n.options.body==='call mum')));i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(await app.evaluate(()=>(globalThis.sufficeTestNotifications||[]).some(n=>n.options.body==='call mum')),true,'native notification fired');
  await shot(page,'5-sidebar');
  await page.locator('.reminder-row').filter({hasText:'call mum'}).getByRole('button',{name:/Mark reminder done/}).click();
  await page.locator('.reminders-section').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
});
