// Hidden boot check of a packaged app. Usage: node scripts/desktop/smoke.mjs <Suffice.app> <out.png>
// SUFFICE_SMOKE_PRELOAD: colon-separated preload files (e.g. dialog stubs, window hiding) passed as -r.
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const req=createRequire(import.meta.url),{_electron}=req('playwright-core');
const [appPath,out]=process.argv.slice(2);if(!appPath||!out)throw new Error('usage: smoke.mjs <Suffice.app> <out.png>');
const root=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-smoke-'))),home=resolve(root,'home'),sh=resolve(root,'suffice');
await mkdir(home,{recursive:true});await mkdir(sh,{recursive:true});
const env={PATH:process.env.PATH,HOME:home,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,PI_OFFLINE:'1',SUFFICE_HOME:sh,OPENAI_API_KEY:'sk-test-fake-not-real'};
const args=(process.env.SUFFICE_SMOKE_PRELOAD||'').split(':').filter(Boolean).flatMap(f=>['-r',f]);
const app=await _electron.launch({executablePath:resolve(appPath,'Contents/MacOS/Suffice'),args:[...args,'--user-data-dir='+resolve(root,'ud')],env});
const errors=[];let home_ok=false;
try{const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
 await page.waitForTimeout(4000);
 home_ok=(await page.locator('.home textarea').count())>0;
 const b=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
 await writeFile(out,Buffer.from(b,'base64'));
}finally{await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});try{process.kill(app.process().pid,'SIGKILL')}catch{}await rm(root,{recursive:true,force:true});}
console.log('PAGEERRORS',errors.length);for(const e of errors)console.log(' ',e);console.log('HOME_RENDERED',home_ok);
process.exit(errors.length||!home_ok?1:0);
