import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
test('mac preview keeps lights stationary and puts chat controls in a floating bar',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-mac-float-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString();await writeFile(resolve(dir,'chat.jsonl'),[{type:'session',version:3,id:'caption',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Caption fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_WINDOW_CHROME:'macos'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.thread-row').first().click();await page.locator('.caption-chat-tools-macos .thread-header').waitFor();
 const red=()=>page.locator('[data-window="close"]').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y};});const expanded=await red();
 await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).waitFor();const collapsed=await red();assert.deepEqual(collapsed,expanded);
 const geometry=await page.locator('.sidebar-collapsed-tools').evaluate(bar=>{const r=bar.getBoundingClientRect(),buttons=bar.querySelectorAll('.button'),green=bar.querySelector('[data-window="maximize"]').getBoundingClientRect(),panel=buttons[0].querySelector('.icon').getBoundingClientRect(),search=buttons[1].querySelector('.icon').getBoundingClientRect();return {x:r.x,y:r.y,gap1:panel.left-(green.left+(green.width+12)/2),gap2:search.left-panel.right};});assert.ok(Math.abs(geometry.x-geometry.y)<.1);assert.ok(Math.abs(geometry.gap1-geometry.gap2)<=2,JSON.stringify(geometry));assert.equal(await page.locator('.window-controls').evaluate(el=>getComputedStyle(el,'::before').display),'none');
 await page.getByRole('button',{name:'Open sidebar',exact:true}).click();assert.deepEqual(await red(),expanded);
 }finally{await app.close();}
});
test('macOS ICNS includes valid PNG representations at every Dock and Finder size',async()=>{
 const icon=await readFile(resolve('apps/desktop/assets/suffice-logo-macos.icns'));assert.equal(icon.toString('ascii',0,4),'icns');assert.equal(icon.readUInt32BE(4),icon.length);let offset=8;const sizes=[];while(offset<icon.length){const length=icon.readUInt32BE(offset+4);assert.ok(length>8&&offset+length<=icon.length);assert.equal(icon.subarray(offset+9,offset+12).toString(),'PNG');sizes.push(icon.readUInt32BE(offset+24));offset+=length;}assert.deepEqual(sizes,[16,32,64,128,256,512,1024]);
});
