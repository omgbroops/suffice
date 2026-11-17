import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {tmpdir} from 'node:os';
import {_electron} from 'playwright-core';
import {windowsTaskbarDetails} from './windows-taskbar-details.mjs';
import {patchExecutableIcons,prepareWindowsDevExecutable} from '../electron/dev-icon.mjs';
import {guard} from './electron-guard.mjs';
test('development icon replacement stays inside existing PE resources',{skip:process.platform!=='win32'},async()=>{
 const bytes=await readFile(electronPath),icon=await readFile(resolve('apps/desktop/assets/suffice-logo.ico'));
 const header=bytes.readUInt32LE(60),optional=header+24,table=optional+bytes.readUInt16LE(header+20);let start,end;
 for(let i=0;i<bytes.readUInt16LE(header+6);i++){const at=table+i*40;if(bytes.toString('ascii',at,at+8).replaceAll('\0','')==='.rsrc'){start=bytes.readUInt32LE(at+20);end=start+bytes.readUInt32LE(at+16);}}
 assert.ok(start&&end);const hash=(a,b)=>createHash('sha256').update(bytes.subarray(a,b)).digest('hex'),prefix=hash(0,start),suffix=hash(end,bytes.length),resources=hash(start,end);
 assert.ok(patchExecutableIcons(bytes,icon)>0);assert.equal(hash(0,start),prefix);assert.equal(hash(end,bytes.length),suffix);assert.notEqual(hash(start,end),resources);
 assert.throws(()=>patchExecutableIcons(Buffer.alloc(256),icon),/Invalid executable/);
});

test('the branded development executable keeps source relaunch arguments and its own taskbar identity',{skip:process.platform!=='win32',timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-branded-launch-')),executablePath=await prepareWindowsDevExecutable(electronPath,resolve('apps/desktop/assets/suffice-logo.ico'));
 const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({executablePath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,defaultApp:process.defaultApp}));assert.deepEqual(runtime,{packaged:true,defaultApp:true});
  const details=await windowsTaskbarDetails(app);assert.equal(details.appId,'com.suffice.desktop.development');assert.match(details.icon,/app-icons[\\/]suffice-[a-f0-9]{16}\.ico,0$/);
  const link=await app.evaluate(({shell,app})=>shell.readShortcutLink(app.getPath('userData')+'/Suffice.lnk'));assert.ok(link.args.includes(resolve('apps/desktop')));assert.ok(link.args.includes(resolve(home,'profile')));
 }finally{await app.close();}
});
