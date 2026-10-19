import {mkdir, readFile, writeFile, realpath, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {VERSION} from './options.mjs';
import {createSufficeSession} from './session.mjs';
import {repositoryTools} from './tools.mjs';
import {ROUTING_POLICY} from './routing.mjs';

async function login(runtime,options,sharedReader) {
  const identity=resolve(options.home,'host-id');
  let deviceId;
  try {deviceId=(await readFile(identity,'utf8')).trim();}
  catch(e) {if(e.code!=='ENOENT') throw e;deviceId=randomUUID();await writeFile(identity,deviceId,{mode:0o600});}
  const controller=new AbortController();
  const cancel=()=>controller.abort();process.on('SIGINT',cancel);
  const timer=setTimeout(cancel,15*60_000);let reader=sharedReader;
  try {
    await runtime.login('openai','oauth',{
      signal:controller.signal,
      notify(event) {
        if(event.type==='auth_url') {
          console.log(`Sign in to OpenAI:\n${event.url}\n`);
          const cmd=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
          const args=process.platform==='win32'?['url.dll,FileProtocolHandler',event.url]:[event.url];
          const browser=spawn(cmd,args,{stdio:'ignore',detached:true,windowsHide:true});
          browser.on('error',()=>{});browser.unref();
        } else if(event.type==='progress') console.log(event.message);
      },
      async prompt(request) {
        if(!process.stdin.isTTY) throw new Error('Complete login in an interactive terminal.');
        reader??=createInterface({input:process.stdin,output:process.stdout});
        return reader.question(`${request.message??'Paste the login response'} `,{signal:controller.signal});
      }
    },{getDeviceId:()=>deviceId,agentName:'Suffice'});
    console.log('Signed in. You can now run suffice in your project.');
  } finally {clearTimeout(timer);process.off('SIGINT',cancel);if(reader!==sharedReader) reader?.close();}
}

export async function main(options) {
  options.cwd=await realpath(options.cwd);
  if(!(await stat(options.cwd)).isDirectory()) throw new Error('--cwd must be a directory');
  await mkdir(options.home,{recursive:true,mode:0o700});
  const runtime=await ModelRuntime.create({authPath:resolve(options.home,'auth.json'),modelsPath:null,modelsStorePath:resolve(options.home,'catalog.json'),allowModelNetwork:false});
  if(options.command==='login') return login(runtime,options);
  if(options.command==='doctor') {
    const tools=repositoryTools({workspace:options.cwd});
    const bash=tools.find(t=>t.name==='bash');
    const result=await bash.execute('doctor',{command:'printf SUFFICE_SHELL_OK',timeout:10});
    if(!result.content?.some(c=>c.text?.includes('SUFFICE_SHELL_OK')) || result.isError) throw new Error('Bash check failed. On Windows, install Git for Windows (Git Bash).');
    const ids=options.routing==='auto'?[ROUTING_POLICY.sol,ROUTING_POLICY.luna]:[options.model];
    const modelsInCatalog=Object.fromEntries(ids.map(id=>[id,Boolean(runtime.getModel('openai',id))]));
    const available=Object.values(modelsInCatalog).every(Boolean);
    console.log(JSON.stringify({name:'Suffice',version:VERSION,node:process.versions.node,cwd:options.cwd,home:options.home,model:options.model,modelInCatalog:available,routing:options.routing,modelsInCatalog,subscription:runtime.isUsingSubscription('openai'),shell:'ready',tools:tools.map(t=>t.name),sandbox:false},null,2));
    if(!available) process.exitCode=1;
    return;
  }
  if(process.stdin.isTTY && !options.print) {
    const {runInteractive}=await import('./interactive.mjs');
    return runInteractive(options,runtime);
  }
  if(!runtime.isUsingSubscription('openai')) throw new Error('Sign in first with: npx suffice login. No API-key fallback.');
  if(!options.prompt) {
    const chunks=[];for await(const chunk of process.stdin) chunks.push(chunk);
    options.prompt=Buffer.concat(chunks).toString('utf8').trim();
    if(!options.prompt) throw new Error('Provide a task, or start suffice in an interactive terminal.');
  }
  const agent=await createSufficeSession(options,runtime,{
    onTool(name){console.error(`  ${name}`);},
    onRoute(route){console.error(`Route: ${route.model} · ${route.effort}${route.complexContext?' · keeping complex context':''}`);}
  });
  const cancel=()=>agent.abort();process.on('SIGINT',cancel);
  try {
    console.error(`Suffice ${VERSION} | ${options.routing==='auto'?'routing auto':`${agent.session.model.id} | ${agent.session.thinkingLevel}`}`);
    console.log(await agent.run(options.prompt));
  } finally {
    process.off('SIGINT',cancel);
    console.error(`${agent.totals.modelCalls} model calls | API-equivalent ${agent.totals.costUnknown?'at least ':''}$${agent.totals.estimatedApiUsd.toFixed(4)}`);
    console.error(`Receipts: ${agent.eventPath}`);
    await agent.dispose();
  }
}
