import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBashTool,createCodemodeExtension} from '@earendil-works/pi-coding-agent';
import {createObservationController} from '../src/pipeline/observations.mjs';

async function fixture(t,options={}){
  const root=await mkdtemp(join(tmpdir(),'suffice-observations-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,'repo');await mkdir(workspace);
  return {root,workspace,observation:createObservationController({workspace,artifactDir:join(root,'logs'),...options})};
}
function native(observation,workspace,exec){
  return observation.wrapTool(createBashTool(workspace,{exposeSessionEnvironment:false,operations:observation.wrapBashOperations({exec})}));
}

test('short native output and programmatic schema remain intact; artifact round trips exactly',async t=>{
  const {observation,workspace}=await fixture(t);
  const tool=native(observation,workspace,async(_command,_cwd,{onData})=>{onData(Buffer.from('hello\r\n'));return {exitCode:0};});
  const result=await tool.execute('short',{command:'fixture'});
  assert.equal(result.content[0].text,'hello\r\n');
  assert.equal(result.structuredContent.output,'hello\r\n');
  assert.equal(result.structuredContent.exit_code,0);
  assert.equal(result.outputSchema,undefined);
  const [artifact]=observation.artifacts();
  assert.deepEqual(await readFile(artifact.path),Buffer.from('hello\r\n'));
  const page=await observation.readTool.execute('read',{id:artifact.id});
  assert.equal(page.structuredContent.output,'hello\r\n');
  assert.equal(page.structuredContent.eof,true);
});

test('native output beyond its 1MiB schema cap is fully retained, diagnostics and updates are bounded',async t=>{
  const {observation,workspace}=await fixture(t,{maxChars:1800});
  const chunks=[Buffer.from('start\n'),Buffer.from('noise\n'.repeat(100)),Buffer.from('fatal: diagnostic in middle\n'),Buffer.from('noise\n'.repeat(200000)),Buffer.from('end\n')];
  const original=Buffer.concat(chunks),updates=[];
  const tool=native(observation,workspace,async(_command,_cwd,{onData})=>{for(const c of chunks){onData(c);await new Promise(r=>setTimeout(r,2));}return {exitCode:7};});
  const result=await tool.execute('big',{command:'fixture'},undefined,update=>updates.push(update));
  assert.equal(result.isError,true);
  assert.equal(result.structuredContent.exit_code,7);
  assert.equal(result.structuredContent.truncated,true);
  assert.ok(result.structuredContent.output.length>1000000);
  assert.ok(result.content[0].text.length<=1800);
  assert.match(result.content[0].text,/exit=7; error=true/);
  assert.match(result.content[0].text,/diagnostic in middle/);
  assert.match(result.content[0].text,/start/);
  assert.match(result.content[0].text,/end/);
  assert.ok(updates.length>=2);
  for(const update of updates)assert.ok(update.content.reduce((n,c)=>n+(c.text?.length??0),0)<=1800);
  const [artifact]=observation.artifacts();
  assert.deepEqual(await readFile(artifact.path),original);
  const page=await observation.readTool.execute('read',{id:artifact.id,search:'diagnostic in middle',maxBytes:60});
  assert.match(page.structuredContent.output,/diagnostic in middle/);
  // Native Pi temp files are deliberately left to Pi's own lifecycle.
});

test('bounded observations preserve structured objects by identity and non-text evidence',async t=>{
  const {observation}=await fixture(t,{maxChars:1000});
  const structured={output:'raw'.repeat(1000),exit_code:1,truncated:false};
  const image={type:'image',data:'example',mimeType:'image/png'};
  const input={content:[{type:'text',text:'left'.repeat(600)},image,{type:'text',text:'right'.repeat(600)}],structuredContent:structured,isError:true,details:{marker:true}};
  const result=await observation.presentResult(input);
  assert.equal(result.structuredContent,structured);
  assert.equal(result.isError,true);
  assert.equal(result.details.marker,true);
  assert.equal(result.content[1],image);
  assert.ok(result.content[0].text.length<=1000);
  const [artifact]=observation.artifacts();
  assert.equal(await readFile(artifact.path,'utf8'),input.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'));
  const small={content:[{type:'text',text:'ok'}],structuredContent:structured};
  assert.equal(await observation.presentResult(small),small);
});

test('timeout and cancellation keep the entire emitted output recoverable',async t=>{
  for(const aborted of [false,true]){
    const {observation,workspace}=await fixture(t,{maxChars:1000});
    const original=Buffer.from('unicode: \u03bb\n'.repeat(2000));
    const abort=new AbortController();
    const tool=native(observation,workspace,async(_command,_cwd,{onData})=>{
      onData(original);if(aborted)abort.abort();throw new Error(aborted?'aborted':'timeout:2');
    });
    await assert.rejects(tool.execute('error',{command:'fixture'},abort.signal),error=>{
      assert.ok(error.message.length<=1000);
      assert.equal(error.observation.status,aborted?'cancelled=true':'timeout=true');
      assert.match(error.message,/command_output/);
      return true;
    });
    assert.deepEqual(await readFile(observation.artifacts()[0].path),original);
  }
});

test('concurrent nested calls are isolated and arbitrary binary output is retrievable',async t=>{
  const {observation,workspace}=await fixture(t);
  const tool=native(observation,workspace,async(command,_cwd,{onData})=>{
    onData(Buffer.from(command));await new Promise(r=>setTimeout(r,command==='A'?10:1));
    onData(Buffer.from([0,255,128]));return {exitCode:0};
  });
  const [a,b]=await Promise.all(['A','B'].map(command=>tool.execute(command,{command})));
  for(const [result,letter] of [[a,'A'],[b,'B']]){
    const page=await observation.readTool.execute('read',{id:result.details.observation.id,encoding:'base64'});
    assert.deepEqual(Buffer.from(page.structuredContent.output,'base64'),Buffer.concat([Buffer.from(letter),Buffer.from([0,255,128])]));
  }
  assert.equal(observation.artifacts().length,2);
});

test('retrieval enforces opaque ids, bounds, literal search across chunk boundaries, and cancellation',async t=>{
  const {observation}=await fixture(t);
  await observation.presentResult({content:[{type:'text',text:'x'.repeat(65534)+'match-at-boundary'+'z'.repeat(10000)}]});
  const id=observation.artifacts()[0].id;
  await assert.rejects(observation.readTool.execute('read',{id:'../../private'}),/Unknown/);
  await assert.rejects(observation.readTool.execute('read',{id,maxBytes:99999}),/Invalid/);
  const found=(await observation.readTool.execute('read',{id,search:'match-at-boundary',maxBytes:17})).structuredContent;
  assert.equal(found.match_offset,65534);assert.equal(found.output,'match-at-boundary');
  const absent=(await observation.readTool.execute('read',{id,search:'not-present'})).structuredContent;
  assert.equal(absent.eof,true);assert.equal(absent.output,'');
  const abort=new AbortController();abort.abort();
  await assert.rejects(observation.readTool.execute('read',{id,search:'x'},abort.signal),/abort/i);
});

test('logs cannot be placed inside the workspace, including through a directory symlink',async t=>{
  const {root,workspace}=await fixture(t);
  assert.throws(()=>createObservationController({workspace,artifactDir:join(workspace,'logs')}),/outside/);
  const link=join(root,'outside-link');
  try{await symlink(workspace,link,process.platform==='win32'?'junction':'dir');}
  catch(error){if(['EPERM','EACCES'].includes(error.code)){t.diagnostic('Symlink test unavailable on this host');return;}throw error;}
  const other=createObservationController({workspace,artifactDir:join(link,'logs')});
  await assert.rejects(other.presentResult({content:[{type:'text',text:'x'.repeat(7000)}]}),/outside/);
});

test('operations cannot claim exact capture unless attached to an observed bash tool',async t=>{
  const {observation}=await fixture(t);
  const operations=observation.wrapBashOperations({exec:async()=>({exitCode:0})});
  await assert.rejects(operations.exec('unused','.',{}),/require wrapTool/);
  const untouched={name:'read',execute:()=>42};assert.equal(observation.wrapTool(untouched),untouched);
});

test('real Pi codemode consumes original structured output before final presentation is capped',async t=>{
  const {observation,workspace}=await fixture(t,{maxChars:1000});
  const output='data\n'.repeat(3000);
  const bash=native(observation,workspace,async(_command,_cwd,{onData})=>{onData(Buffer.from(output));return {exitCode:0};});
  let definition;
  createCodemodeExtension({models:false,mode:'only'})({registerTool:tool=>{definition=tool;},getAllTools:()=>[],appendEntry:()=>{}});
  const ctx={tools:[bash],sessionManager:{getBranch:()=>[]},async executeTool(_name,args,{signal}){
    const result=await bash.execute('nested',args,signal);
    return {toolCall:{id:'nested'},result,isError:!!result.isError};
  }};
  const result=await definition.execute('script',{code:'const result=await tools.bash({command:"fixture"}); if(result.output.length!==15000 || result.exit_code!==0) throw new Error("Programmatic output changed"); text(result.output);'},undefined,undefined,ctx);
  assert.equal(result.isError,undefined);
  assert.ok(result.content.filter(c=>c.type==='text').reduce((n,c)=>n+c.text.length,0)>1000);
  const presented=await observation.presentResult(result);
  assert.ok(presented.content[0].text.length<=1000);
  assert.match(presented.content[0].text,/command_output/);
  assert.equal(observation.artifacts().length,2);
});
