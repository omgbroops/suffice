// Hidden geometry audit: walks every screen state, screenshots it, and lists
//  (a) rounded children in rounded containers whose curve is not concentric with the container's
//  (b) outset (non-inset) box-shadows on surfaces nested in another surface.
// usage: node apps/desktop/visual-review/geometry-audit.mjs <before|after>
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,readdir,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const MODE=process.argv[2]||'before';
const ROOT='/Users/abhayg/suffice-desktop-wt/ui-shots/r2-geometry';
const out=resolve(ROOT,MODE);await mkdir(out,{recursive:true});
const SRC=resolve('apps/desktop/src');
// ---- CSS rule index (selector, file:line, whether it declares radius / shadow)
const rules=[];
for(const f of (await readdir(SRC)).filter(f=>f.endsWith('.css'))){const t=await readFile(resolve(SRC,f),'utf8');
 for(const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)){const sel=m[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();if(!sel||sel.startsWith('@'))continue;const body=m[2];
  const radius=/(^|[;\s])border(-[a-z]+)*-radius\s*:/.test(body),shadow=/(^|[;\s])box-shadow\s*:/.test(body);if(!radius&&!shadow)continue;
  const start=m.index+m[0].indexOf(m[1].trim().slice(0,1),0);rules.push({sel,file:'apps/desktop/src/'+f,line:t.slice(0,m.index+m[1].length-m[1].trimStart().length).split('\n').length,radius,shadow});}}
// ---- in-page audit
const auditFn=({rules,state})=>{
 const px=v=>parseFloat(v)||0;
 const eff=(cs,c,r)=>{let v=cs['border'+c+'Radius'].split(' ')[0];let n=parseFloat(v)||0;if(v.endsWith('%'))n=n*Math.min(r.width,r.height)/100;return Math.min(n,r.width/2,r.height/2);};
 const paint=cs=>{const m=cs.backgroundColor.match(/rgba?\(([^)]+)\)/);const a=m?(m[1].split(',')[3]!==undefined?parseFloat(m[1].split(',')[3]):1):0;return a>0.02||cs.backgroundImage!=='none'||(px(cs.borderTopWidth)>0&&cs.borderTopStyle!=='none')||(cs.boxShadow!=='none');};
 const name=el=>{let p=[];for(let e=el;e&&e!==document.body&&p.length<4;e=e.parentElement){let s=e.tagName.toLowerCase();if(e.id)s+='#'+e.id;const c=[...e.classList].slice(0,2).join('.');if(c)s+='.'+c;p.unshift(s);}return p.join(' > ');};
 const where=(el,prop)=>{const hits=rules.filter(r=>r[prop]&&(()=>{try{return el.matches(r.sel.replace(/::?(before|after|hover|active|focus-visible|focus|disabled)\b/g,'').replace(/\s+/g,' '));}catch{return false;}})());const h=hits.at(-1);return h?h.file.replace('apps/desktop/src/','')+':'+h.line:'inline/unknown';};
 const layers=s=>{const o=[];let d=0,cur='';for(const ch of s){if(ch==='(')d++;if(ch===')')d--;if(ch===','&&d===0){o.push(cur.trim());cur='';}else cur+=ch;}if(cur.trim())o.push(cur.trim());return o;};
 const FLOAT='.popover,.menu,[role=menu],[role=listbox],.toast,dialog,.tooltip,.spotlight,.model-menu,.composer,.message-toolbar,.thread-user,.sidebar,.workspace,.right-panel-content,.window-frame';
 const issues=[],shadows=[];
 const all=[...document.querySelectorAll('body *')];
 const vis=el=>{const r=el.getBoundingClientRect();if(r.width<4||r.height<4)return false;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)return false;if(r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth)return false;return true;};
 const corners=['TopLeft','TopRight','BottomRight','BottomLeft'];
 for(const el of all){if(!vis(el))continue;if(el.closest('svg')&&el.tagName.toLowerCase()!=='svg')continue;const cs=getComputedStyle(el);
  // shadows: outset layers on a surface nested inside another painted surface
  if(cs.boxShadow!=='none'){const outs=layers(cs.boxShadow).filter(l=>!/\binset\b/.test(l)).filter(l=>{const nums=(l.replace(/rgba?\([^)]*\)/,'').match(/-?[\d.]+px/g)||[]).map(parseFloat);const blur=nums[2]||0,x=nums[0]||0,y=nums[1]||0;const alpha=(l.match(/rgba?\(([^)]*)\)/)||[])[1];const col=alpha&&alpha.split(',').length>3?parseFloat(alpha.split(',')[3]):1;return (blur>0||x||y)&&col>0.01;});
   if(outs.length){let p=el.parentElement,host=null;while(p&&p!==document.body){const pc=getComputedStyle(p);if(px(pc.borderTopLeftRadius)>0&&paint(pc)||p.matches(FLOAT)){host=p;break;}p=p.parentElement;}
    const floating=el.matches(FLOAT)||!!el.closest('.popover,.menu,[role=menu],[role=listbox],.toast,dialog,.tooltip,.spotlight,.model-menu');
    if(host&&!floating)shadows.push({state,el:name(el),shadow:outs.join(' | '),inside:name(host),src:where(el,'shadow')});}}
  // radius concentricity vs nearest painted rounded ancestor
  const r0=el.getBoundingClientRect();const rs=corners.map(c=>eff(cs,c,r0));if(!paint(cs))continue;
  let par=el.parentElement,host=null;while(par&&par!==document.documentElement){const pc=getComputedStyle(par);if(corners.some(c=>px(pc['border'+c+'Radius'])>0)&&(paint(pc)||pc.overflow!=='visible')){host=par;break;}par=par.parentElement;}
  if(!host)continue;const hc=getComputedStyle(host),hr=host.getBoundingClientRect(),r=el.getBoundingClientRect();
  const hbw=[px(hc.borderLeftWidth),px(hc.borderTopWidth),px(hc.borderRightWidth),px(hc.borderBottomWidth)];
  // host content+border box: children measure from the outer edge of the host curve
  corners.forEach((c,i)=>{const rp=eff(hc,c,hr);if(rp<=0.5)return;const left=i===0||i===3,top=i===0||i===1;
   const dx=left?r.left-hr.left:hr.right-r.right,dy=top?r.top-hr.top:hr.bottom-r.bottom;
   if(dx<-0.5||dy<-0.5||dx>=rp||dy>=rp)return;// child not inside this corner zone
   const rc=rs[i];const clipped=hc.overflow!=='visible'&&dx<0.5&&dy<0.5;if(clipped)return;// flush child is clipped by the host curve
   const asym=Math.abs(dx-dy)>2;
   // centre of child arc vs centre of host arc (0 => same centre => even gap)
   const off=Math.hypot((dx+rc)-rp,(dy+rc)-rp),ideal=Math.max(rp-Math.min(dx,dy),0);
   const wide=el.clientWidth>0&&r.width>=hr.width-1&&r.height>=hr.height-1;
   if(off>1.25)issues.push({state,el:name(el),host:name(host),corner:c,hostRadius:+rp.toFixed(1),childRadius:+rc.toFixed(1),dx:+dx.toFixed(1),dy:+dy.toFixed(1),idealRadius:+ideal.toFixed(1),centreOffset:+off.toFixed(1),src:where(el,'radius'),hostSrc:where(host,'radius'),fill:wide,asym});});}
 return {issues,shadows,counted:all.length};
};
// ---- fixtures
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-geo-')));const socket='sfx-r2-geometry-'+MODE;
const home=resolve(tmp,'home'),project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice');
for(const d of [project,data,suffice,resolve(suffice,'sessions/fixture')])await mkdir(d,{recursive:true});
const sh=(...a)=>execFileSync('git',['-C',project,...a],{stdio:'ignore'});
await writeFile(resolve(project,'hello.txt'),'before\n');await mkdir(resolve(project,'src'));await writeFile(resolve(project,'src/app.ts'),'export const a = 1;\n');
sh('init','-q');sh('add','.');sh('-c','user.name=F','-c','user.email=f@example.invalid','commit','-qm','f');await writeFile(resolve(project,'hello.txt'),'after\nmore\n');
const ts=new Date().toISOString();const M=(id,parentId,message)=>({type:'message',id,parentId,timestamp:ts,message:{...message,timestamp:Date.now()}});
await writeFile(resolve(suffice,'sessions/fixture/fixture.jsonl'),[{type:'session',version:3,id:'geo-fixture',timestamp:ts,cwd:project},
 M('u1',null,{role:'user',content:[{type:'text',text:'Clean the build output and fix the greeting.'}]}),
 M('a1','u1',{role:'assistant',stopReason:'toolUse',content:[{type:'text',text:'The build folder holds three object files. I will remove them and fix the typo in `greet.js`.'},{type:'toolCall',id:'c1',name:'bash',arguments:{command:'rm -rf build'}},{type:'toolCall',id:'c2',name:'edit',arguments:{path:'greet.js',oldText:'helo',newText:'hello'}}]}),
 M('r1','a1',{role:'toolResult',toolCallId:'c1',toolName:'bash',content:[{type:'text',text:'ok'}]}),
 M('r2','r1',{role:'toolResult',toolCallId:'c2',toolName:'edit',content:[{type:'text',text:'edited'}]}),
 M('a2','r2',{role:'assistant',stopReason:'stop',content:[{type:'text',text:'Done. Here is the fixed function:\n\n```js\nexport function greet(name) {\n  return `Hello, ${name}!`;\n}\n```\n\n- Build output removed\n- Greeting fixed\n\n| a | b |\n|---|---|\n| 1 | 2 |'}]})].map(JSON.stringify).join('\n')+'\n');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{PI_OFFLINE:'1',SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:home});
await mkdir(home,{recursive:true});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
const appPid=app.process().pid;let page;const project0=null;const all={issues:[],shadows:[],states:[]};const errors=[];
const snap=async name=>{await page.waitForTimeout(450);await page.screenshot({path:resolve(out,name+'.png')});const r=await page.evaluate(auditFn,{rules,state:name});all.issues.push(...r.issues);all.shadows.push(...r.shadows);all.states.push({name,elements:r.counted,issues:r.issues.length,shadows:r.shadows.length});console.log(name,r.issues.length,r.shadows.length);};
const step=async(name,fn)=>{try{await fn();}catch(e){console.error('STEP FAIL',name,e.message.replace(/\x1b\[[0-9;]*m/g,'').slice(0,420));if(name==='right-panel-files')console.error('DBGP',await page.evaluate(()=>document.querySelector('.panel-tab-select')?.closest('[role=tablist],.panel-tabs,header,div')?.parentElement?.outerHTML.slice(0,900)).catch(()=>''));if(name==='session')console.error('DBG',await page.evaluate(()=>[...document.querySelectorAll('button,[data-menu-action],.thread-header *')].filter(e=>e.getBoundingClientRect().width).map(e=>e.className+'|'+(e.dataset.menuAction||'')+'|'+(e.textContent||'').trim().slice(0,20)).join('\n')).catch(()=>''));all.states.push({name,error:e.message.split('\n')[0].slice(0,200)});}};
const esc=async()=>{await page.keyboard.press('Escape');await page.waitForTimeout(250);};
try{
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 for(const theme of ['dark','light']){const T=theme==='dark'?'':'-light';
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(200);
  if(theme==='dark'){
   await step('start',()=>snap('start'));
   await step('start-send-menu',async()=>{await page.locator('[data-action="send-menu"]').click();await snap('start-send-menu');await esc();});
   await step('start-model-picker',async()=>{await page.locator('.model-button').first().click();await snap('start-model-picker');
    const eff=page.locator('.model-effort, [data-effort]').first();if(await eff.count()){await eff.hover().catch(()=>{});await snap('start-model-picker-effort');}await esc();});
   await step('start-access-menu',async()=>{const b=page.locator('.access-mode-picker').first();await b.click({timeout:2500});await snap('start-access-menu');await esc();});
   await step('start-attach-menu',async()=>{await page.locator('[data-action="attach"]').click();await snap('start-attach-menu');await esc();});
   await step('start-composer-attachments',async()=>{await page.evaluate(()=>{const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';document.querySelector('form.composer').attachments.addPayload([{name:'shot.png',type:'image/png',data:png},{name:'notes.md',type:'text/markdown',data:btoa('hi')},{name:'report.pdf',type:'application/pdf',data:btoa('x')},{name:'data.csv',type:'text/csv',data:btoa('a,b')}]);});await page.waitForTimeout(500);await snap('start-composer-attachments');});
   await step('start-composer-typed',async()=>{await page.evaluate(()=>{document.querySelector('form.composer').attachments.payload;});await page.locator('#prompt').fill('Review this\nacross a few lines\nof input');await snap('start-composer-typed');await page.locator('#prompt').fill('');});
  }
  await step('thread'+T,async()=>{await page.locator('.thread-row').first().click();await page.waitForTimeout(700);await snap('thread'+T);});
  if(theme==='dark'){
   await step('thread-tool-open',async()=>{await page.locator('.activity-label').first().click({timeout:2500});await page.waitForTimeout(500);await page.locator('.tool-widget summary, .tool-widget-head, .tool-widget > button').first().click({timeout:1500}).catch(()=>{});await page.waitForTimeout(400);await snap('thread-tool-open');});
   await step('thread-context-menu',async()=>{await page.locator('.thread-row').first().click({button:'right'});await snap('thread-context-menu');await esc();});
   await step('thread-message-actions',async()=>{await page.locator('.thread-message').last().hover();await snap('thread-message-actions');});
   await step('thread-working',async()=>{await app.evaluate(({ipcMain,BrowserWindow})=>{for(const a of ['run','steer'])ipcMain.removeHandler('suffice:'+a);ipcMain.handle('suffice:steer',()=>{});ipcMain.handle('suffice:run',(_e,p)=>new Promise(()=>{BrowserWindow.getAllWindows()[0].webContents.send('suffice:event',{event:'thread_started',id:'t1',threadId:'t1',clientId:p.clientId});}));});
    await page.locator('#prompt').fill('Now run the tests');await page.keyboard.press('Enter');await snap('thread-working');});
   await step('thread-working-attachments',async()=>{await page.evaluate(()=>{const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';document.querySelector('form.composer').attachments.addPayload([{name:'a.png',type:'image/png',data:png},{name:'b.md',type:'text/markdown',data:btoa('hi')},{name:'c.pdf',type:'application/pdf',data:btoa('x')},{name:'d.csv',type:'text/csv',data:btoa('a,b')}]);});await page.waitForTimeout(600);await snap('thread-working-attachments');
    const m=await page.evaluate(()=>{const w=[...document.querySelectorAll('.thread-messages *')].filter(e=>/^Working/.test(e.textContent.trim())&&!e.children.length).at(-1),c=document.querySelector('form.composer');return w&&{workBottom:w.getBoundingClientRect().bottom,composerTop:c.getBoundingClientRect().top};});console.log('WORKING-CLEARANCE',JSON.stringify(m));});
   await step('sidebar-collapsed',async()=>{await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.waitForTimeout(500);await snap('sidebar-collapsed');await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.waitForTimeout(500);});
   await step('right-panel-launcher',async()=>{await page.getByRole('button',{name:'Toggle right panel'}).click();await snap('right-panel-launcher');});
   await step('right-panel-changes-first',async()=>{await page.locator('.panel-launcher').getByRole('button',{name:'Changes',exact:true}).click();await page.waitForTimeout(600);await page.locator('.change-row').first().click().catch(()=>{});await snap('right-panel-changes');});
   await step('right-panel-files',async()=>{await page.getByRole('button',{name:'Add panel tab'}).click();await snap('right-panel-add-menu');await page.getByRole('menuitem',{name:'Files'}).click();await page.waitForTimeout(500);await page.getByRole('treeitem',{name:'hello.txt',exact:true}).click();await page.waitForTimeout(500);await snap('right-panel-files');});
   await step('right-panel-close',async()=>{await page.getByRole('button',{name:'Toggle right panel'}).click();await page.waitForTimeout(400);});
   await step('spotlight',async()=>{await page.keyboard.press('Meta+k');await page.waitForTimeout(400);await snap('spotlight');await esc();});
  }
  // settings pages
  await step('settings'+T,async()=>{await page.locator('[data-action="settings"]').first().click();await page.locator('.settings-nav-item').first().waitFor();await page.waitForTimeout(400);
   const n=await page.locator('.settings-nav-item').count();for(let i=0;i<n;i++){const it=page.locator('.settings-nav-item').nth(i);const label=((await it.textContent())||'p'+i).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'p'+i;await it.click();await page.waitForTimeout(350);await snap('settings-'+label+T);}
   await page.locator('[data-action="close-dialog"], .settings-close, [data-action="settings-close"]').first().click({timeout:1500}).catch(()=>{});await esc();await page.waitForTimeout(300);});
 }
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 // CLI sessions
 await step('session',async()=>{await page.locator('.new-session').click().catch(()=>{});await page.waitForTimeout(400);for(let i=0;i<8&&await page.locator('.attachment-remove').count();i++)await page.locator('.attachment-remove').first().click({force:true});await page.waitForTimeout(300);
  await page.evaluate(p=>sufficeDesktop.sessions.start({agent:'fakeclaude',cwd:p}),project);await page.reload();await page.locator('[data-action="send-menu"]').waitFor();await page.locator('.sidebar-cli-sessions .thread-row').first().click();await page.locator('.thread-header').waitFor();
  await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});await page.waitForTimeout(600);await snap('session-approval');
  await page.locator('.composer-approval button',{hasText:/^\s*(1\.\s*)?Yes\s*$/}).first().click();
  await page.waitForFunction(()=>!document.querySelector('.composer').dataset.approval,null,{timeout:15000});await page.waitForTimeout(2500);await snap('session-chat');
  {const r=page.locator('.session-run:has(.tool-diff)').first();if(await r.count()&&!await r.evaluate(e=>e.open))await r.locator('> summary').click();await page.waitForTimeout(400);await snap('session-chat-open');}
  const subs=page.locator('.session-sub');if(await subs.count()){await subs.nth(0).locator('> summary').evaluate(e=>e.click());await page.waitForTimeout(400);await subs.nth(0).evaluate(e=>e.scrollIntoView({block:'center'}));await snap('session-subagent');}
  await page.locator('.model-button').click();await snap('session-model-menu');await esc();
  await page.locator('.access-mode-picker').click();await snap('session-options-menu');await esc();
  await page.locator('#prompt').click();await page.keyboard.type('/co');await page.waitForTimeout(400);await snap('session-slash-menu');await esc();await page.locator('#prompt').fill('');
  await page.locator('.session-mode-toggle').click();await page.locator('.session-terminal .xterm-rows').waitFor({timeout:15000});await page.waitForTimeout(800);await snap('session-terminal');});
 await step('narrow',async()=>{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:720,height:540}));await page.waitForFunction(()=>innerWidth===720);await snap('session-terminal-720');await page.locator('.session-mode-toggle').click();await page.waitForTimeout(500);await snap('session-chat-720');const m=await page.evaluate(()=>{const t=document.querySelector('.workspace-tools'),b=[...t.querySelectorAll('button')].filter(x=>x.offsetWidth).map(x=>{const r=x.getBoundingClientRect(),c=getComputedStyle(x);return {cls:x.className.slice(0,40),text:x.textContent.trim(),x:r.x,w:r.width,pl:c.paddingLeft,pr:c.paddingRight}});const tr=t.getBoundingClientRect();return {tools:{x:tr.x,w:tr.width,pl:getComputedStyle(t).paddingLeft,pr:getComputedStyle(t).paddingRight},b};});console.log('TOOLS720',JSON.stringify(m));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));});
 await writeFile(resolve(out,'audit.json'),JSON.stringify(all,null,1));
 console.log(JSON.stringify({done:true,issues:all.issues.length,shadows:all.shadows.length,pageErrors:errors}));
}catch(e){console.error('FAIL',e.message.slice(0,800));try{await page.screenshot({path:resolve(out,'FAIL.png')});}catch{}await writeFile(resolve(out,'audit.json'),JSON.stringify(all,null,1)).catch(()=>{});process.exitCode=1;}
finally{await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]).catch(()=>{});try{process.kill(appPid,'SIGKILL');}catch{}try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}await rm(tmp,{recursive:true,force:true});}
process.exit(process.exitCode||0);
