import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
test('mac chrome preserves native traffic lights and floating sidebar and chat controls',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-mac-float-')),dir=resolve(home,'sessions','fixture');await mkdir(dir,{recursive:true});const timestamp=new Date().toISOString();await writeFile(resolve(dir,'chat.jsonl'),[{type:'session',version:3,id:'caption',timestamp,cwd:home},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Caption fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home,SUFFICE_WINDOW_CHROME:'macos'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.thread-row').first().click();await page.locator('.caption-chat-tools-macos .thread-header').waitFor();
 const mode=await page.locator('html').getAttribute('data-window-chrome');assert.ok(['macos-native','macos-preview'].includes(mode));
 const chatBounds=()=>page.locator('.caption-chat-tools-macos').boundingBox();const expanded=await chatBounds();assert.ok(expanded.width>0&&expanded.height>0);
 let red;if(mode==='macos-native'){assert.equal(await page.locator('[data-window]').count(),0);const {windowChrome}=await import('../electron/window-chrome.cjs');assert.deepEqual(windowChrome({platform:'darwin'}).options.trafficLightPosition,{x:16,y:19});}else{red=()=>page.locator('[data-window="close"]').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y};});}
 const lightPosition=red&&await red();await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).waitFor();
 const controls=page.locator('.sidebar-collapsed-tools');assert.equal(await controls.getByRole('button',{name:'Search sessions',exact:true}).isVisible(),true);const geometry=await controls.evaluate(el=>{const bar=el.getBoundingClientRect(),buttons=[...el.querySelectorAll('.button')].map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});return {bar:{left:bar.left,right:bar.right},buttons};});assert.equal(geometry.buttons.length,2);assert.ok(geometry.buttons[0].right<=geometry.buttons[1].left,JSON.stringify(geometry));if(mode==='macos-native')assert.ok(geometry.buttons[0].left>70,JSON.stringify(geometry));else assert.deepEqual(await red(),lightPosition);
 assert.equal(await page.locator('.window-controls').evaluate(el=>getComputedStyle(el,'::before').display),'none');await page.getByRole('button',{name:'Open sidebar',exact:true}).click();if(red)assert.deepEqual(await red(),lightPosition);const restored=await chatBounds();assert.ok(Math.abs(restored.y-expanded.y)<1);

 }finally{await app.close();}
});
test('macOS ICNS includes valid PNG representations at every Dock and Finder size',async()=>{
 const icon=await readFile(resolve('apps/desktop/assets/suffice-logo-macos.icns'));assert.equal(icon.toString('ascii',0,4),'icns');assert.equal(icon.readUInt32BE(4),icon.length);let offset=8;const sizes=[];while(offset<icon.length){const length=icon.readUInt32BE(offset+4);assert.ok(length>8&&offset+length<=icon.length);assert.equal(icon.subarray(offset+9,offset+12).toString(),'PNG');sizes.push(icon.readUInt32BE(offset+24));offset+=length;}assert.deepEqual(sizes,[16,32,64,128,256,512,1024]);
});
