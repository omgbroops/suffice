import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createAutomation,runAutomationProcess} from '../src/automation.mjs';
import {parseOptions} from '../src/options.mjs';
import {createSufficeSession} from '../src/session.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';

const tool=(automation,name,args={},signal)=>automation.tools.find(t=>t.name===name).execute('test',args,signal).then(r=>r.structuredContent);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64');

test('automation options independently remove capabilities',()=>{
  const options=parseOptions(['--no-browser','--no-desktop','--browser-headless'],{});
  assert.equal(options.browser,false);assert.equal(options.desktop,false);assert.equal(options.browserHeadless,true);
  assert.equal(parseOptions([],{SUFFICE_BROWSER:'0'}).browser,false);
  const disabled=createAutomation({home:tmpdir(),sessionId:'disabled',browser:false,desktop:false});
  assert.deepEqual(disabled.tools,[]);assert.equal(disabled.prompt,'');
});

test('typed adapters isolate sessions, serialize calls, preserve errors and pass desktop text on stdin',async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-automation-'));const calls=[];let active=0,peak=0;
  const run=async(kind,args,options)=>{calls.push({kind,args,options});active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;
    return {ok:false,error:{code:'ACTION_FAILED',disposition:{delivery:'delivery_uncertain',retry:'unsafe'}}};};
  const a=createAutomation({home,sessionId:'first',run}),b=createAutomation({home,sessionId:'second',run});
  try {
    await Promise.all([tool(a,'browser_open',{url:'https://example.com'}),tool(a,'browser_snapshot')]);
    assert.equal(peak,1);assert.ok(calls[0].args.includes('--headed'));assert.ok(calls[0].args.includes('--profile'));
    assert.ok(calls[1].args.includes('--delta'));assert.ok(!calls[1].args.includes('-i'));
    const result=await tool(a,'desktop_action',{action:'type',ref:'@snapshot:e2',text:'hello; $(unsafe)'});
    assert.equal(result.error.disposition.retry,'unsafe');assert.equal(calls.length,3);
    assert.equal(calls[2].options.input,'hello; $(unsafe)');assert.ok(!calls[2].args.includes('hello; $(unsafe)'));
    assert.ok(calls[2].args.includes('--headed'));
    await tool(b,'browser_open',{url:'https://example.com'});
    assert.notEqual(calls[0].args[calls[0].args.indexOf('--profile')+1],calls[3].args[calls[3].args.indexOf('--profile')+1]);
    await assert.rejects(tool(a,'browser_open',{url:'file:///private'}),/http/);
    const before=calls.length,controller=new AbortController();controller.abort();
    await assert.rejects(tool(a,'desktop_status',{},controller.signal));assert.equal(calls.length,before);
  } finally {await Promise.all([a.dispose(),b.dispose()]);await rm(home,{recursive:true,force:true});}
});

test('native shortcuts require a target and preserve the chosen window; app constraints are explicit',async()=>{
 const calls=[];
 const a=createAutomation({home:tmpdir(),sessionId:'targeted',run:async(kind,args)=>{calls.push({kind,args});return {ok:true};}});
 try {
  await assert.rejects(tool(a,'desktop_press',{key:'ctrl+t'}),/requires windowId/);assert.equal(calls.length,0);
  await tool(a,'desktop_window',{action:'focus',windowId:'w-fixture'});
  await tool(a,'desktop_press',{key:'ctrl+t',windowId:'w-fixture'});
  assert.deepEqual(calls[0].args.slice(-3),['focus-window','--window-id','w-fixture']);
  assert.deepEqual(calls[1].args.slice(-5),['--headed','press','ctrl+t','--window-id','w-fixture']);
  assert.ok(calls.every(c=>c.kind==='desktop'));
  assert.match(a.prompt,/Never silently switch/);
  assert.match(a.tools.find(t=>t.name==='desktop_press').namespace.instructions,/launch requires an absolute/);
 } finally {await a.dispose();}
});

test('screenshots return image blocks to code mode; large observations remain recoverable',async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-automation-image-'));
  const a=createAutomation({home,sessionId:'images',run:async(_kind,args)=>{
    const shot=args.indexOf('screenshot');if(shot!==-1){await writeFile(args[shot+1],png);return {ok:true,data:{}};}
    return {ok:true,data:{tree:'x'.repeat(49000)}};
  }});
  try {
    const shot=await a.tools.find(t=>t.name==='desktop_screenshot').execute('image',{screen:0});
    assert.equal(shot.content[1].type,'image');assert.equal(shot.structuredContent.image.mimeType,'image/png');
    assert.deepEqual(Buffer.from(shot.structuredContent.image.data,'base64'),png);
    assert.doesNotMatch(shot.content[0].text,/iVBOR/);
    const tree=await tool(a,'desktop_snapshot',{app:'fixture'});
    assert.equal(tree.observationOmitted,true);assert.equal(tree.complete,false);
    assert.equal(JSON.parse(await readFile(tree.artifact,'utf8')).data.tree.length,49000);
  } finally {await a.dispose();await rm(home,{recursive:true,force:true});}
});

test('real sessions register deferred automation without eager schemas; disabled sessions omit them',async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-automation-session-'));const agents=[];
  try {
    const runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
    for(const enabled of [true,false]) {
      const a=await createSufficeSession({...parseOptions([],{}),home,cwd:home,browser:enabled,desktop:enabled},runtime);agents.push(a);
      const names=a.session.getAllTools().filter(t=>/^(browser|desktop)_/.test(t.name));
      assert.equal(names.length>0,enabled);assert.ok(names.every(t=>t.exposure==='deferred'));
      assert.equal(a.session.systemPrompt.includes('searchTools("browser")'),enabled);
      assert.ok(!a.session.getActiveToolNames().some(n=>n.startsWith('browser_')));
      assert.equal(a.session.getCallableToolNames().includes('desktop_status'),enabled);
      assert.doesNotMatch(a.session.agent.state.tools.find(t=>t.name==='codemode').description,/### `browser_open`/);
      if(enabled) {
        const code=a.session.agent.state.tools.find(t=>t.name==='codemode');
        const discovery=await code.execute('discovery-check',{code:'text(await describeTool("browser_snapshot")); text(await describeNamespace("desktop"));'},new AbortController().signal);
        assert.notEqual(discovery.isError,true,JSON.stringify(discovery));
        assert.match(JSON.stringify(discovery.content),/browser_snapshot/);
        assert.match(JSON.stringify(discovery.content),/desktop_screenshot/);
      }
      assert.equal(a.totals.modelCalls,0);
    }
  } finally {for(const a of agents)await a.dispose();await rm(home,{recursive:true,force:true});}
});

test('live browser adapter navigates, fills, observes deltas and returns a PNG; desktop status works', {skip:process.env.SUFFICE_AUTOMATION_SMOKE!=='1'},async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-browser-live-'));
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Suffice automation fixture</title><h1>Fixture</h1><label>Name<input id="name"></label><button onclick="document.querySelector(\'h1\').textContent=\'Saved\'">Save</button>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const a=createAutomation({home,sessionId:'live-fixture',headless:process.env.SUFFICE_AUTOMATION_VISIBLE!=='1'});
  const okay=result=>assert.equal(result.ok??result.success,true,JSON.stringify(result));
  try {
    okay(await tool(a,'browser_open',{url:`http://127.0.0.1:${server.address().port}`}));
    okay(await tool(a,'browser_snapshot'));
    okay(await tool(a,'browser_fill',{target:'#name',text:'hello world'}));
    const value=await tool(a,'browser_read',{property:'value',target:'#name'});okay(value);assert.match(JSON.stringify(value),/hello world/);
    okay(await tool(a,'browser_click',{target:'button'}));
    const snapshot=await tool(a,'browser_snapshot');okay(snapshot);assert.match(JSON.stringify(snapshot),/Saved/);
    const shot=await tool(a,'browser_screenshot');okay(shot);assert.equal(shot.image.type,'image');
    okay(await runAutomationProcess('desktop',['status']));
  } finally {await a.dispose();await new Promise(r=>server.close(r));await rm(home,{recursive:true,force:true});}
});

test('live native fixture supports accessibility actions and screenshot fallback', {skip:process.env.SUFFICE_AUTOMATION_SMOKE!=='1'||process.platform!=='win32'},async()=>{
  const home=await mkdtemp(resolve(tmpdir(),'suffice-native-live-'));
  const title=`Suffice fixture ${Date.now()}`;
  const script=`Add-Type -AssemblyName System.Windows.Forms
Add-Type 'using System; using System.Runtime.InteropServices; public class FixtureWindow { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command); }'
$form = New-Object System.Windows.Forms.Form
$form.Text = '${title}'
$field = New-Object System.Windows.Forms.TextBox
$field.AccessibleName = 'Fixture name'
$field.Top = 10
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Save'
$button.Top = 50
$button.Add_Click({ $form.Text = '${title} Saved' })
$form.Controls.Add($field)
$form.Controls.Add($button)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({ [FixtureWindow]::ShowWindow($form.Handle, 5) | Out-Null; $timer.Stop() })
$timer.Start()
$form.ShowDialog() | Out-Null`;
  const child=spawn('powershell.exe',['-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let launchStderr='';child.stderr.on('data',data=>{launchStderr+=data.toString();});
  let launchError;child.on('error',e=>{launchError=e;});
  const a=createAutomation({home,sessionId:'native-fixture',browser:false});
  const okay=value=>assert.equal(value.ok,true,JSON.stringify(value));
  try {
    let window;
    for(let attempt=0;attempt<30&&!window;attempt++) {
      if(launchError)throw launchError;
      if(child.exitCode!==null)throw new Error(`Fixture exited ${child.exitCode}: ${launchStderr}`);
      const list=await tool(a,'desktop_apps',{kind:'windows'});okay(list);
      const entries=Array.isArray(list.data)?list.data:list.data.windows;
      window=entries?.find(w=>w.title===title);
      if(!window)await new Promise(r=>setTimeout(r,200));
    }
    assert.ok(window,'Fixture window appeared');
    const snapshot=await tool(a,'desktop_snapshot',{windowId:window.id,timeoutMs:15000});okay(snapshot);
    const nodes=[];const visit=n=>{if(!n||typeof n!=='object')return;if(n.ref_id)nodes.push(n);for(const value of Object.values(n))if(typeof value==='object')Array.isArray(value)?value.forEach(visit):visit(value);};visit(snapshot.data.tree);
    const field=nodes.find(n=>n.name==='Fixture name'),button=nodes.find(n=>n.name==='Save');
    assert.ok(field,JSON.stringify(snapshot));assert.ok(button);
    okay(await tool(a,'desktop_action',{action:'set-value',ref:field.ref_id,text:'hello native'}));
    const read=await tool(a,'desktop_get',{ref:field.ref_id,property:'value'});okay(read);assert.match(JSON.stringify(read),/hello native/);
    const screenshot=await tool(a,'desktop_screenshot',{windowId:window.id});okay(screenshot);assert.equal(screenshot.image.type,'image');
    okay(await tool(a,'desktop_action',{action:'click',ref:button.ref_id}));
    const windows=await tool(a,'desktop_apps',{kind:'windows'});okay(windows);assert.match(JSON.stringify(windows),new RegExp(title+' Saved'));
  } finally {child.kill();await a.dispose();await rm(home,{recursive:true,force:true});}
});
