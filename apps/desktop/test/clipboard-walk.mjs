// Real OS clipboard paste, no screen: main writes the system clipboard, then webContents.paste() runs Chromium's real paste.
// (a) a copied image -> Chromium's clipboard files; (b) a copied file (public.file-url, as Finder writes) -> the native clipboardFiles path.
// It touches the user's clipboard, so it only runs when the clipboard holds plain text (saved first, restored after);
// with anything richer it refuses and exits 2 without writing.
// usage: node apps/desktop/test/clipboard-walk.mjs <shots-dir>   (from repo root after `bun run desktop:build`)
import {_electron} from 'playwright-core';
import {mkdtemp,writeFile,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {electronPath,hiddenMain,testEnv} from './electron-app.mjs';
const out=resolve(process.argv[2]||'clipboard-shots');await mkdir(out,{recursive:true});
const home=await realpath(await mkdtemp(resolve(tmpdir(),'suffice-clip-')));
const alpha=resolve(home,'alpha-site');await mkdir(alpha);
const file=resolve(home,'copied-notes.md');await writeFile(file,'# Copied from Finder\nanswer = 42\n');
const RAW='electron '+'application/osclipboard';
const PLAIN=['text/plain',`${RAW};format="public.utf8-plain-text"`,`${RAW};format="NSStringPboardType"`];
const errors=[],state={};let n=0,saved=null,refused=null;
const app=await _electron.launch({executablePath:electronPath,args:[hiddenMain,'--user-data-dir='+resolve(home,'electron')],env:testEnv({SUFFICE_HOME:home,SUFFICE_FAKE_HARNESS:'1',SUFFICE_FAKE_SIGNED_IN:'1'})});
try{
 const before=await app.evaluate(async({clipboard},plain)=>{const types=(await clipboard.read()).flatMap(item=>item.types);return {types,plainOnly:types.every(type=>plain.includes(type)),text:await clipboard.readText()};},PLAIN);
 if(!before.plainOnly){refused=before.types;throw new Error('refused');}
 saved=before.text;
 await app.evaluate(({shell,dialog},p)=>{shell.openExternal=async()=>{};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},alpha);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.composer').waitFor();await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.getByRole('button',{name:'New project',exact:true}).click();await page.waitForTimeout(800);
 const shot=async name=>{n++;await page.screenshot({path:resolve(out,`${String(n).padStart(2,'0')}-${name}.png`),timeout:30000});};
 const chips=()=>page.evaluate(()=>[...document.querySelectorAll('.composer .attachment-card')].map(e=>e.textContent.trim().slice(0,40)));
 const pasteFromMain=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.paste());
 const sendAndReply=async text=>{await page.locator('#prompt').fill(text);await page.locator('#prompt').press('Enter');await page.waitForTimeout(2000);return page.evaluate(()=>[...document.querySelectorAll('.thread-assistant')].at(-1)?.textContent.trim());};
 // (a) image on the real clipboard
 await app.evaluate(async({clipboard,ClipboardItem})=>{const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));await clipboard.write([new ClipboardItem({'image/png':new Blob([png],{type:'image/png'})})]);});
 await page.locator('#prompt').focus();await pasteFromMain();await page.waitForTimeout(1000);
 state.imageChips=await chips();await shot('pasted-image');
 state.imageReply=await sendAndReply('what is in this image');
 // (b) a copied file, the way Finder puts it on the pasteboard
 await app.evaluate(async({clipboard,ClipboardItem},[raw,url])=>{await clipboard.write([new ClipboardItem({[`${raw};format="public.file-url"`]:url})]);},[RAW,pathToFileURL(file).href]);
 await page.locator('#prompt').focus();await pasteFromMain();await page.waitForTimeout(1000);
 state.fileChips=await chips();await shot('pasted-file');
 state.fileReply=await sendAndReply('read the copied file');
 console.log(JSON.stringify(state,null,1));
 const check=(ok,m)=>{if(!ok)errors.push(m);};
 check(state.imageChips.length===1&&/\[images:1\]/.test(state.imageReply||''),'image pasted from the system clipboard did not reach the run');
 check(state.fileChips.some(c=>c.includes('copied-notes.md'))&&/\[context:/.test(state.fileReply||''),'file copied to the system clipboard did not reach the run');
}catch(error){if(!refused)errors.push(error.message);}
finally{
 if(saved!==null){
  await app.evaluate(async({clipboard},text)=>{clipboard.clear();if(text)await clipboard.writeText(text);},saved).catch(error=>errors.push('clipboard restore failed: '+error.message));
  const after=await app.evaluate(({clipboard})=>clipboard.readText()).catch(()=>null);
  if(after!==saved)errors.push('clipboard not restored');
 }
 await app.close().catch(()=>{});
}
if(refused){console.log('refused: clipboard holds',JSON.stringify(refused),'- nothing written');process.exit(2);}
console.log('errors',JSON.stringify(errors));
process.exit(errors.length?1:0);
