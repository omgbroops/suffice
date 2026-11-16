import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {_electron} from 'playwright-core';
import electronPath from 'electron';
import policy from '../electron/browser-surface.cjs';

test('guest web addresses and native bounds are limited',()=>{
 for(const uri of ['http://localhost:8000/','https://example.test/test','about:blank'])assert.equal(policy.allowed(uri),true);
 for(const uri of ['data:text/plain,x','file:///tmp/fixture','suffice://localhost/','https://suffice.localhost./','http://user:pass@example.test/','about:settings'])assert.equal(policy.allowed(uri),false);
 assert.deepEqual(policy.rectangle({x:-8,y:99,width:1e8,height:40},200,100),{x:0,y:99,width:200,height:1});
});

test('isolated native panel browses a frame-denying site, edits it, and follows the panel lifecycle',{timeout:65000},async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'suffice-browser-')),dir=join(scratch,'sessions','fixture'),cwd=join(scratch,'project');
 const downloadRequests=[];
 const site=createServer(async(req,res)=>{
   if(req.url==='/download'){
     const chunks=[];for await(const chunk of req)chunks.push(chunk);
     const body=Buffer.concat(chunks).toString();downloadRequests.push({method:req.method,body,cookie:req.headers.cookie});
     res.writeHead(200,{'Content-Disposition':'attachment; filename="fixture.txt"','Content-Type':'application/octet-stream'});res.end('Saved original POST: '+body);return;
   }
   res.writeHead(200,{'Content-Type':'text/html','X-Frame-Options':'DENY','Content-Security-Policy':"frame-ancestors 'none'",'Set-Cookie':'fixture=panel; Path=/; SameSite=Strict'});
   if(req.url==='/popup'){res.end('<title>Popup</title><script>window.opener?.postMessage("fixture-opened",location.origin)</script><button id="finish" onclick="window.close()">Done</button>');return;}
   res.end('<title>'+ (req.url==='/two'?'Second':'First')+'</title><label>Note <input id="note"></label><a id="next" href="/two">Next page</a><button id="popup" onclick="window.open(' + JSON.stringify('/popup').replaceAll('"','&quot;') + ',' + JSON.stringify('fixturePopup').replaceAll('"','&quot;') + ')">Popup</button><form method="post" action="/download"><input type="hidden" name="singleUse" value="original"><button id="download">Download</button></form><script>window.onmessage=e=>{if(e.origin===location.origin)window.popupReceipt=e.data}</script>');
 });
 await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+site.address().port;
 let app;
 const eventually=async(fn,verify,what)=>{const end=Date.now()+6000;let value;do{value=await fn();if(verify(value))return;await delay(50);}while(Date.now()<end);assert.fail(what+': '+JSON.stringify(value));};
 try{
  await Promise.all([mkdir(dir,{recursive:true}),mkdir(cwd)]);
  const timestamp=new Date().toISOString();await writeFile(join(dir,'one.jsonl'),[{type:'session',version:3,id:'browser-test',timestamp,cwd},{type:'message',id:'user',parentId:null,timestamp,message:{role:'user',content:[{type:'text',text:'Browser fixture'}],timestamp:Date.now()}}].map(JSON.stringify).join('\n')+'\n');
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:scratch};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+join(scratch,'profile')],env});
  await app.evaluate(({dialog},destination)=>{
    globalThis.fixtureConsent={allow:false,save:false};
    dialog.showMessageBoxSync=()=>globalThis.fixtureConsent.allow?1:0;
    dialog.showSaveDialogSync=()=>globalThis.fixtureConsent.save?destination:undefined;
  },join(scratch,'saved-file.txt'));
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  const inspect=()=>app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0],view=win.contentView.children.at(-1);return view?{bounds:view.getBounds(),visible:view.getVisible(),url:view.webContents.getURL(),isolated:view.webContents.session!==win.webContents.session}:null;});
  const guest=expr=>app.evaluate(({BrowserWindow},code)=>BrowserWindow.getAllWindows()[0].contentView.children.at(-1).webContents.executeJavaScript(code),expr);
  const click=async id=>{const point=await guest(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)}})()`);await app.evaluate(({BrowserWindow},point)=>{const wc=BrowserWindow.getAllWindows()[0].contentView.children.at(-1).webContents;wc.focus();for(const type of ['mouseDown','mouseUp'])wc.sendInputEvent({type,...point,button:'left',clickCount:1});},point);};
  await page.locator('.thread-row').first().click();const open=page.getByRole('button',{name:'Toggle right panel',exact:true});await open.click();await page.locator('.panel-launcher').getByRole('button',{name:'Browser',exact:true}).click();
  const address=page.getByRole('textbox',{name:'Browser address'});await address.fill(base+'/one');await address.press('Enter');
  await eventually(inspect,s=>s?.url===base+'/one'&&s.visible&&s.isolated,'native guest loaded');
  assert.deepEqual(await guest('[typeof window.sufficeDesktop,typeof window.require,typeof window.process,window.top===window]'),['undefined','undefined','undefined',true]);
  await click('note');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.at(-1).webContents.insertText('typed in the native page'));
  assert.equal(await guest('document.querySelector("input").value'),'typed in the native page');
  await click('next');await eventually(()=>address.inputValue(),s=>s===base+'/two','address followed page link');
  await page.getByRole('button',{name:'Browser back',exact:true}).click();await eventually(inspect,s=>s.url===base+'/one','back');
  await page.getByRole('button',{name:'Browser forward',exact:true}).click();await eventually(inspect,s=>s.url===base+'/two','forward');
  await guest('window.ephemeralMarker=1');await page.getByRole('button',{name:'Reload page',exact:true}).click();await eventually(()=>guest('typeof window.ephemeralMarker'),s=>s==='undefined','reload');
  await click('popup');await page.getByText('Pop-up cancelled.',{exact:true}).waitFor();
  await app.evaluate(()=>{globalThis.fixtureConsent.allow=true;});
  await click('popup');await eventually(inspect,s=>s?.url===base+'/popup','original native popup opened');
  assert.deepEqual(await guest('[!!opener, typeof window.sufficeDesktop, typeof window.require,document.cookie]'),[true,'undefined','undefined','fixture=panel']);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.executeJavaScript('window.popupReceipt')),'fixture-opened');
  await click('finish');await eventually(inspect,s=>s?.url===base+'/two'&&s.visible,'window.close restores opener');
  await click('popup');await page.getByRole('button',{name:'Close pop-up and return to previous page'}).click();
  await eventually(inspect,s=>s?.url===base+'/two'&&s.visible,'trusted popup dismiss restores opener');
  await click('download');await page.getByText('Download cancelled.',{exact:true}).waitFor();
  await assert.rejects(readFile(join(scratch,'saved-file.txt')),{code:'ENOENT'});
  await app.evaluate(()=>{globalThis.fixtureConsent.save=true;});
  await click('download');await page.getByText('Download saved.',{exact:true}).waitFor();
  assert.equal(await readFile(join(scratch,'saved-file.txt'),'utf8'),'Saved original POST: singleUse=original');
  assert.deepEqual(downloadRequests,Array.from({length:2},()=>({method:'POST',body:'singleUse=original',cookie:'fixture=panel'})));
  const before=await inspect();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1080,680));
  await eventually(inspect,s=>s?.bounds.height!==before.bounds.height&&s.bounds.width>0,'native viewport resized');
  await open.click();await eventually(inspect,s=>s?.visible===false,'collapsed browser is hidden');
  await open.click();await eventually(inspect,s=>s?.visible===true,'restored browser is visible');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await eventually(inspect,s=>s?.visible===false,'settings occlude guest');await page.keyboard.press('Escape');await eventually(inspect,s=>s?.visible===true,'leaving settings restores guest');
  await address.fill('file:///tmp/private');await address.press('Enter');await page.locator('.browser-status').waitFor();assert.equal((await inspect()).url,base+'/two');
  await page.getByRole('tab',{name:'Browser',exact:true}).focus();await page.keyboard.press('Delete');await eventually(inspect,s=>s===null,'guest destroyed');assert.deepEqual(errors,[]);
 }finally{try{await app?.close();}finally{site.closeAllConnections();await new Promise(r=>site.close(r));await rm(scratch,{recursive:true,force:true,maxRetries:3,retryDelay:100});}}
});
