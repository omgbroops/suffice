import {mkdir, readFile, writeFile, realpath, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {VERSION, HELP} from './options.mjs';
import {createSufficeSession} from './session.mjs';
import {repositoryTools} from './tools.mjs';

async function login(runtime,options) {
  const identity=resolve(options.home,'host-id');
  let deviceId;
  try {deviceId=(await readFile(identity,'utf8')).trim();}
  catch(e) {if(e.code!=='ENOENT') throw e;deviceId=randomUUID();await writeFile(identity,deviceId,{mode:0o600});}
  const controller=new AbortController();
  const cancel=()=>controller.abort();process.on('SIGINT',cancel);
  const timer=setTimeout(cancel,15*60_000);let reader;
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
  } finally {clearTimeout(timer);process.off('SIGINT',cancel);reader?.close();}
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
    const available=Boolean(runtime.getModel('openai',options.model));
    console.log(JSON.stringify({name:'Suffice',version:VERSION,node:process.versions.node,cwd:options.cwd,home:options.home,model:options.model,modelInCatalog:available,subscription:runtime.isUsingSubscription('openai'),shell:'ready',tools:tools.map(t=>t.name),sandbox:false},null,2));
    if(!available) process.exitCode=1;
    return;
  }
  if(!runtime.isUsingSubscription('openai')) throw new Error('Sign in first with: suffice login (or use --home with your existing Suffice credential directory). No API-key fallback.');
  const interactive=Boolean(process.stdin.isTTY && !options.print);
  if(!options.prompt && !interactive) {
    const chunks=[];for await(const chunk of process.stdin) chunks.push(chunk);
    options.prompt=Buffer.concat(chunks).toString('utf8').trim();
    if(!options.prompt) throw new Error('Provide a task, or start suffice in an interactive terminal.');
  }
  let reader, busy=false, agent;
  const notify=message=>process.stderr.write(`${message}\n`);
  const cancel=()=>{if(busy) agent?.abort();else reader?.close();};
  process.on('SIGINT',cancel);
  const open=async()=>createSufficeSession(options,runtime,{
    onTool(name,input) {
      const detail=input?.path || (name==='bash'?input.command:'');
      notify(`  ${name}${detail?' · '+String(detail).replace(/[\r\n\x1b]/g,' ').slice(0,140):''}`);
    },
    onAssistant(message) {
      if(interactive) for(const c of message.content) if(c.type==='text' && c.text.trim()) console.log(`\n${c.text}\n`);
    }
  });
  const usage=()=>notify(`${agent.totals.modelCalls} model calls · API-equivalent ${agent.totals.costUnknown?'at least ':''}$${agent.totals.estimatedApiUsd.toFixed(4)}${agent.totals.costUnknown?' (incomplete usage)':''}`);
  const run=async prompt=>{
    busy=true;
    const pulse=setInterval(()=>notify('  Working…'),30_000);
    try {const answer=await agent.run(prompt);if(!interactive) console.log(answer);}
    finally {clearInterval(pulse);busy=false;usage();}
  };
  try {
    agent=await open();
    notify(`Suffice ${VERSION} · ${options.model} · ${agent.session.thinkingLevel}\n${options.cwd}\nCommands run with your user permissions; this preview is not sandboxed.`);
    if(options.prompt) await run(options.prompt);
    if(!interactive) return;
    reader=createInterface({input:process.stdin,output:process.stdout});
    reader.on('SIGINT',cancel);
    console.log('Type a task, /help for commands, or /exit to leave.');
    while(true) {
      let input;
      try {input=(await reader.question('suffice > ')).trim();}
      catch(e) {if(e.code==='ERR_USE_AFTER_CLOSE' || e.code==='ABORT_ERR') break;throw e;}
      if(!input) continue;
      if(['/exit','/quit'].includes(input)) break;
      try {
        if(input==='/help') console.log(HELP);
        else if(input==='/usage') usage();
        else if(input==='/new') {await agent.dispose();options.continue=false;agent=await open();console.log('Started a new session.');}
        else if(input.startsWith('/model ')) {
          const id=input.slice(7).trim(),model=runtime.getModel('openai',id);
          if(!model) throw new Error(`Unknown catalog model: ${id}`);
          await agent.session.setModel(model);options.model=id;
          notify(`Model: ${id} · effort: ${agent.session.thinkingLevel}`);
        }
        else if(input.startsWith('/effort ')) {
          const effort=input.slice(8).trim();
          if(!['off','minimal','low','medium','high','xhigh'].includes(effort)) throw new Error('Invalid effort');
          agent.session.setThinkingLevel(effort);options.effort=agent.session.thinkingLevel;
          notify(`Effort: ${options.effort}`);
        }
        else if(input.startsWith('/')) console.log('Unknown command. Use /help.');
        else await run(input);
      } catch(e) {notify(`Suffice: ${e.message}`);}
    }
  } finally {
    reader?.close();process.off('SIGINT',cancel);
    if(agent) {notify(`Session: ${agent.sessionPath()??'(no messages)'}\nReceipts: ${agent.eventPath}`);await agent.dispose();}
  }
}
