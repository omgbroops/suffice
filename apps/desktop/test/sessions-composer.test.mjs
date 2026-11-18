import electronPath from 'electron';
// Hidden run (SUFFICE_TEST_HIDE_WINDOW=1) of the session composer controls against fake agents on a private tmux socket.
// Screenshots go to $COMPOSER_SHOTS (default ui-shots/composer-controls/after). Never touches the "suffice" socket.
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const KEY='composer-controls',socket=`sfx-test-${KEY}-${process.pid}`;process.env.SUFFICE_TEST_HIDE_WINDOW='1';process.env.SUFFICE_SESSIONS_SOCKET=socket;
const shots=process.env.COMPOSER_SHOTS||resolve('../ui-shots/composer-controls/after');await mkdir(shots,{recursive:true});
const tmp=await realpath(await mkdtemp(resolve(tmpdir(),'sfx-composer-')));
const project=resolve(tmp,'demo-project'),data=resolve(tmp,'data'),suffice=resolve(tmp,'suffice'),home=resolve(tmp,'home');
for(const d of [project,data,suffice,home])await mkdir(d,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env,{SUFFICE_HOME:suffice,SUFFICE_START_PROJECT:project,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_SESSIONS_SOCKET:socket,SUFFICE_HISTORY_HOME:home,
 SUFFICE_TEST_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-agent.mjs'),SUFFICE_TEST_NODE:process.execPath,SUFFICE_TEST_CLAUDE_AGENT:resolve('packages/backend/test/fixtures/sessions/fake-claude-agent.mjs'),
 NODE_PATH:process.env.NODE_PATH||'/Users/abhayg/suffice-desktop-wt/voice/node_modules'});
const app=await _electron.launch({executablePath:electronPath,args:['-r','/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs',resolve('apps/desktop'),`--user-data-dir=${data}`],env});
const appPid=app.process().pid;app.process().stderr?.on('data',d=>{const t=String(d);if(/no-dialog|Error/.test(t))console.error(t.slice(0,600));});let page,failed=null;
const ok=(c,m)=>{if(!c)throw new Error(m);};
try{
 page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 ok(await app.evaluate(()=>process.env.SUFFICE_SESSIONS_SOCKET)===socket&&process.env.SUFFICE_TEST_HIDE_WINDOW==='1','private socket / hidden window not set');
 await page.locator('[data-action="send-menu"]').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 const shot=async n=>{await page.waitForTimeout(450);await page.screenshot({path:resolve(shots,n+'.png')});};
 const sel=()=>page.evaluate(()=>JSON.stringify(document.querySelector('.composer').modelSelection??null));
 const press=async(t)=>{await page.waitForTimeout(t);};

 // 1. start screen: the model list has an Agent CLIs group (fake agents appear in the test env only)
 await page.waitForFunction(()=>sufficeDesktop.sessions.available().then(a=>a.agents.some(x=>!x.missing)));
 await page.waitForTimeout(500);
 await page.waitForFunction(()=>document.querySelector(".composer").modelSelection);const preSelection=await sel(),preLabel=await page.locator('.model-button').innerText();
 await page.locator('.model-button').click();await page.locator('.popover.model-picker').waitFor();if(await page.locator('.model-picker .model-stage-button').count())await page.locator('.model-picker .model-stage-button').click();await page.locator('.popover.model-picker .model-options').waitFor();
 ok(await page.locator('.model-picker .model-provider-title',{hasText:'Agent CLIs'}).count()===1,'no Agent CLIs group');
 ok(!await page.locator('.model-picker .effort-track').count(),'effort stage on start screen list');
 await page.evaluate(()=>{const l=document.querySelector('.model-picker .model-options');l.scrollTop=l.scrollHeight;});
 await shot('start-model-list-agent-clis');
 await page.locator('.model-picker [data-agent="fakeclaude"]').click();
 ok(await sel()===JSON.stringify({provider:'cli',model:'fakeclaude'}),'agent selection shape: '+await sel());
 ok(!await page.locator('.model-picker .effort-track').count(),'agent row opened an effort stage');
 await page.keyboard.press('Escape');await page.waitForTimeout(250);
 const stdPH=await page.locator('#prompt').getAttribute('placeholder');

 // 2. open a fake Claude session
 const cwd=await app.evaluate(()=>process.env.SUFFICE_START_PROJECT);await page.evaluate(([a,p])=>sufficeDesktop.sessions.start({agent:a,cwd:p}),['fakeclaude',cwd]);await page.reload();await page.locator('[data-action="send-menu"]').waitFor();await page.locator('.sidebar-cli-sessions .thread-row').first().click();
 await page.locator('.thread-header').waitFor();
 const sid=await page.evaluate(async()=>(await sufficeDesktop.sessions.list()).at(-1).id);
 ok(execFileSync('tmux',['-L',socket,'list-sessions','-F','#{session_name}'],{encoding:'utf8'}).trim().length>0,'session not on the private socket');
 await page.locator('.composer-approval:not([hidden])').waitFor({timeout:20000});await page.waitForTimeout(500);
 await page.locator('.composer-approval button',{hasText:/^\s*(1\.\s*)?Yes\s*$/}).first().click();await page.waitForFunction(()=>!document.querySelector('.composer').dataset.approval,null,{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('.composer').modelSource?.models.length>0&&document.querySelector('.composer').accessSource?.modes.length>1);
 await page.waitForTimeout(1200);
 const composerText=await page.locator('.composer').innerText();
 ok(!/Full access/.test(composerText),'Full access in session composer');
 ok(await page.locator('.composer .model-button .provider-logo').count()===1,'model chip has no provider logo');
 ok(await page.locator('.composer .model-button .model-effort').count()===1,'model chip has no effort word');
 ok(!await page.locator('.session-ctl').count(),'header chips still present');
 ok(!await page.locator('.thread-header .session-meta .session-ctl').count(),'header controls remain');
 await shot('session-composer-idle');

 await page.evaluate(i=>sufficeDesktop.sessions.send(i,'/clear'),sid);await page.waitForTimeout(1800);
 // 3. model picker in the session: same DOM as standard chat
 await page.locator('.model-button').click();await page.locator('.popover.model-picker .effort-track').waitFor();
 ok(await page.evaluate(()=>!!document.querySelector('.popover.model-picker .effort-track input[type=range]')),'no slider');
 await shot('session-model-picker-effort');
 await page.locator('.model-stage-button').click();await page.locator('.model-picker .model-options .model-option').first().waitFor();
 ok(await page.locator('.model-picker .model-option',{hasText:'Haiku'}).count()===1,'catalog row missing');
 ok(!await page.locator('.model-picker .model-option',{hasText:'clear override'}).count(),'mixed label set');
 await shot('session-model-picker-list');
await page.locator('.model-picker .model-option',{hasText:/^Sonnet$/}).click();
 // the stand-in answers "/model <name>" by opening its picker: proof the sim received setModel; meta never confirms, so the trigger stays pending
 await page.locator('.popover.session-picker .menu-item').first().waitFor();
 ok(await page.locator('.model-button').getAttribute('aria-busy')==='true'&&/…/.test(await page.locator('.model-button').innerText()),'pending trigger');
 ok(/Sonnet/.test(await page.locator('.model-button #model-label').innerText()),'pending trigger does not show the target');
 await shot('session-model-pending');
 await page.waitForFunction(()=>!document.querySelector('.model-button').hasAttribute('aria-busy'),null,{timeout:25000});
 ok(await page.locator('.toast',{hasText:'No confirmation from the terminal'}).count()>0,'no timeout toast');
 ok(/Haiku/.test(await page.locator('.model-button #model-label').innerText()),'label moved without confirmation');

 // 4. permission mode menu
 await page.locator('.access-mode-picker').click();await page.locator('.access-mode-menu .menu-item').first().waitFor();
 const modes=await page.locator('.access-mode-menu .menu-label').allInnerTexts();
 for(const m of ['Manual','Accept edits','Plan','Auto','Bypass'])ok(modes.some(t=>t.startsWith(m)),'mode missing '+m+': '+modes);
 ok(!modes.some(t=>/Full access|Don.t ask/.test(t)),'forbidden mode listed');
 ok(await page.locator('.access-mode-menu .access-mode-detail').count()>=5,'mode detail lines missing');
 await shot('session-mode-menu');await page.keyboard.press('Escape');await page.waitForTimeout(250);

 // 5. slash menu
 await page.locator('#prompt').click();await page.keyboard.type('/co');await page.locator('.slash-menu .menu-item').first().waitFor();await page.waitForTimeout(250);
 const slashRows=await page.locator('.slash-menu .menu-label').allInnerTexts();
 ok(slashRows.length&&slashRows.every(t=>t.startsWith('/')),'slash labels: '+slashRows);
 await shot('session-slash-menu');
 await page.keyboard.press('Escape');await page.waitForTimeout(250);ok(await page.locator('.slash-menu').isHidden(),'slash menu stayed open');
 await page.locator('#prompt').fill('');
 ok(await page.locator('#prompt').getAttribute('placeholder')===stdPH,'placeholder changed in session');

 // 6. queued message, context warning, native picker (typed screens of the stand-in)
 const type=async t=>{await page.evaluate(([i,t])=>sufficeDesktop.sessions.send(i,t),[sid,t]);await page.waitForTimeout(1800);};
 const reset=async()=>{await page.keyboard.press('Escape');await type('/clear');await page.mouse.click(720,450);await page.waitForTimeout(300);};
 await type('/queue');
 await page.locator('.queued-messages .queued-message .queued-message-text').first().waitFor();
 ok(!await page.locator('.session-notice--quiet.session-queued').count(),'old queued box');
 await shot('session-queued');await reset();
 await type('/ctx');
 await page.locator('.queued-messages .queued-message',{hasText:/Context/}).waitFor();
 ok(await page.locator('.queued-message button',{hasText:'Compact'}).count()===1,'Compact button');
 await shot('session-context-warning');await reset();
 await type('/model');
 await page.locator('.popover.session-picker .menu-item').first().waitFor();await page.waitForTimeout(300);
 ok(await page.locator('.composer .model-button').isVisible()&&await page.locator('.composer .send-button').isVisible(),'footer hidden while a card shows');
 ok(await page.locator('.session-picker .menu-item[aria-pressed="true"]').count()===1,'selected row');
 await shot('session-native-picker');await reset();

 // 7. leave: the normal composer is restored exactly
 await page.locator('.new-session').click();await page.waitForTimeout(600);
 ok(await page.evaluate(()=>document.querySelector('.composer').modelSource===undefined&&document.querySelector('.composer').accessSource===undefined),'sources not cleared');
 ok(await sel()===preSelection,`modelSelection changed ${preSelection} -> ${await sel()}`);
 {const now=await page.locator('.model-button').innerText();ok(now===preLabel,`model label changed after leave: ${JSON.stringify(preLabel)} -> ${JSON.stringify(now)}`);}
 ok(await page.locator('.access-mode-picker').count()===1&&!/Bypass|Manual/.test(await page.locator('.access-mode-picker').innerText()),'mode button kept session mode');
 await shot('after-leave-normal-composer');
 ok(!errors.length,'page errors: '+errors.join(' | '));
 console.log('sessions-composer: ok');
}catch(e){failed=e;console.error('FAIL',e.message);if(page)await page.screenshot({path:resolve(shots,'FAIL.png')}).catch(()=>{});}
finally{
 await app.close().catch(()=>{});
 try{process.kill(appPid,0);process.kill(appPid);}catch{}
 try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}
}
process.exit(failed?1:0);
