import {access,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,delimiter,extname,join} from 'node:path';
import {runProcess} from './process.mjs';

// Frozen standard text-token estimates, checked 2026-10-23. Not subscription invoices.
export const PRICING=Object.freeze({
  'gpt-6-luna':{input:.1,cached:.01,output:.5,source:'https://developers.openai.com/api/docs/models/gpt-6-luna'},
  'gpt-6.1-sol':{input:2,cached:.1,output:10,source:'https://developers.openai.com/api/docs/models/gpt-6.1-sol'},
});
const exists=path=>access(path).then(()=>true,()=>false);
export async function resolveCodex(bin=process.env.SUFFICE_CODEX_BIN??'codex') {
  if(Array.isArray(bin)){if(!bin.length||bin.some(x=>typeof x!=='string'||x.includes('\0')))throw Error('Invalid adapter command');return {command:bin[0],prefix:bin.slice(1)};}
  const names=process.platform==='win32'&&!extname(bin)?[bin+'.exe',bin+'.cmd',bin+'.ps1',bin]:[bin];
  const dirs=bin.includes('/')||bin.includes('\\')?['']:(process.env.PATH??'').split(delimiter);
  for(const dir of dirs)for(const name of names){const path=resolve(dir,name);if(!await exists(path))continue;
    if(/\.(?:cmd|ps1)$/i.test(path)){
      const cli=join(dirname(path),'node_modules','@openai','codex','bin','codex.js');
      if(!await exists(cli))throw Error('Unsupported Codex wrapper; set SUFFICE_CODEX_BIN to a native executable');
      return {command:process.execPath,prefix:[cli]};
    }
    return {command:path,prefix:[]};
  }
  throw Error('Codex CLI is not on PATH');
}
export function parseCodexEvents(stdout,{model,noTools=false,exitCode=0,timedOut=false}={}) {
  let started=0,completed=0,text='',invalid=false,failed=false;
  const usage={inputTokens:0,cachedInputTokens:0,outputTokens:0},ids=new Set();
  for(const line of String(stdout).split('\n').filter(x=>x.trim())){
    let e;try{e=JSON.parse(line);}catch{invalid=true;continue;}
    if(e.type==='turn.started')started++;
    if(e.type==='turn.failed'||e.type==='error')failed=true;
    if(e.type==='turn.completed'){
      completed++;const u=e.usage;
      if(!u||['input_tokens','cached_input_tokens','output_tokens'].some(k=>!Number.isSafeInteger(u[k])||u[k]<0)||u.cached_input_tokens>u.input_tokens){invalid=true;continue;}
      usage.inputTokens+=u.input_tokens;usage.cachedInputTokens+=u.cached_input_tokens;usage.outputTokens+=u.output_tokens;
    }
    if(e.item){
      if(e.item.type==='error')failed=true;
      if(e.type==='item.completed'&&e.item.type==='agent_message')text=String(e.item.text??'');
      if(!['agent_message','reasoning','error'].includes(e.item.type))ids.add(e.item.id??JSON.stringify(e.item));
    }
  }
  const price=PRICING[model];
  // Aggregate input cannot identify long-context per-request surcharges. Refuse a precise estimate above that boundary.
  const reconciled=started===1&&completed===1&&!invalid&&!failed&&exitCode===0&&!timedOut;
  const costKnown=Boolean(reconciled&&price&&usage.inputTokens<=272_000);
  const costUsd=costKnown?((usage.inputTokens-usage.cachedInputTokens)*price.input+usage.cachedInputTokens*price.cached+usage.outputTokens*price.output)/1e6:null;
  return {text,usage,costKnown,costUsd,toolCalls:ids.size,valid:reconciled&&(!noTools||ids.size===0),
    error:noTools&&ids.size?'Restricted review used a tool':!reconciled?'Incomplete or invalid Codex receipts':!costKnown?'Token pricing unavailable for this receipt':null};
}
export function codexArgs(call) {
  const args=['exec','--json','--ephemeral','--ignore-user-config','--ignore-rules','--model',call.model,'--cd',call.workspace,
    '--sandbox',call.noTools?'read-only':'workspace-write'];
  const config={approval_policy:'never',model_reasoning_effort:call.effort,web_search:'disabled',mcp_servers:{},
    'features.apps':false,'features.plugins':false,'features.hooks':false,'features.multi_agent':false,
    'features.browser_use':false,'features.computer_use':false,'features.image_generation':false,'features.memories':false,
    'features.shell_snapshot':false,'features.code_mode_host':false};
  if(call.noTools){config['features.shell_tool']=false;config.project_doc_max_bytes=0;}
  for(const [key,value]of Object.entries(config))args.push('-c',`${key}=${typeof value==='object'?'{}':JSON.stringify(value)}`);
  if(call.schemaPath)args.push('--output-schema',call.schemaPath);
  args.push('-');return args;
}
export function createCodexAdapter({bin,run=runProcess}={}) {
  let resolved;
  return async call=>{
    const {role,model,effort,workspace,runDir,timeoutMs,noTools=false}=call;
    await mkdir(runDir,{recursive:true});
    let schemaPath;
    if(call.outputSchema){schemaPath=resolve(runDir,'output.schema.json');await writeFile(schemaPath,JSON.stringify(call.outputSchema),{flag:'wx'});}
    await writeFile(resolve(runDir,'prompt.txt'),call.prompt,{flag:'wx',mode:0o600});
    let out;
    try{
      resolved??=await resolveCodex(bin);
      out=await run(resolved.command,[...resolved.prefix,...codexArgs({...call,schemaPath})],{cwd:workspace,input:call.prompt,timeoutMs,
        stdoutPath:resolve(runDir,'events.jsonl'),stderrPath:resolve(runDir,'stderr.txt')});
    }catch(error){return {role,model,effort,status:'failed',text:'',costUsd:null,costKnown:false,toolCalls:0,error:error.message,usage:{}};}
    const parsed=parseCodexEvents(out.stdout,{model,noTools,exitCode:out.exitCode,timedOut:out.timedOut});
    const result={role,model,effort,...parsed,status:out.timedOut?'timeout':parsed.valid&&!out.error&&!out.overflow?'completed':'failed',
      error:out.error??(out.overflow?'Output allowance exceeded':parsed.error),latencyMs:out.latencyMs,
      pricing:PRICING[model]??null,costBasis:'Standard text-token estimate; no invoice, tool fees or cache-write premiums',
      toolPolicy:noTools?'Disabled optional capabilities plus zero-tool event audit; native tool schemas are not removed':'Native Codex workspace-write'};
    if(out.error||out.overflow||out.timedOut){result.costKnown=false;result.costUsd=null;}
    await writeFile(resolve(runDir,'receipt.json'),JSON.stringify(result,null,2));
    return result;
  };
}
