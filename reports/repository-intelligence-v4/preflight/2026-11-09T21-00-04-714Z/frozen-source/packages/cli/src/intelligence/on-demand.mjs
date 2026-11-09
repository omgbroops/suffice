import {readText,hash,repositoryPath} from '../workspace.mjs';
import {relative} from 'node:path';
import {listIntelligenceSources,isIntelligenceConfiguration} from './source-files.mjs';

// Rules see only tool actions and repository source, never benchmark labels.
export function onDemandExtension(engine,{workspace,log=()=>{}}){
  return pi=>{
    let baseline=new Map(),active=false,activation,lastEvidence,dirty=new Set(),failurePaths=new Set(),reasons=new Set(),failed=false;
    const commands=new Map();
    const query=(operation,reason,args)=>{log({type:'graph_query',operation,reason,args});return engine[operation](args);};
    const exported=source=>/\bexport\b|\bmodule\s*\.\s*exports\b|\bexports\s*\./.test(source);
    async function versions(){
      const started=performance.now(),sources=await listIntelligenceSources(workspace);
      const map=new Map();for(const path of [...sources.paths,...sources.configurationPaths]){try{const text=await readText(workspace,path);map.set(path,{version:hash(text),exported:!isIntelligenceConfiguration(path)&&exported(text),configuration:isIntelligenceConfiguration(path)});}catch{}}
      log({type:'graph_version_scan',latencyMs:performance.now()-started,readFiles:map.size,fileSelection:sources.selection});
      return map;
    }
    async function activate(reason){reasons.add(reason);if(active)return;if(!activation)activation=query('begin',reason).then(()=>{active=true;});await activation;}
    pi.on('before_agent_start',async()=>{engine.resetBaseline();baseline=await versions();active=false;activation=undefined;lastEvidence=undefined;dirty=new Set();failurePaths=new Set();reasons=new Set();failed=false;commands.clear();log({type:'graph_controller_start',mode:'on-demand',indexed:false,scannedFiles:baseline.size});});
    pi.on('tool_call',async e=>{
      if(e.toolName==='bash')commands.set(e.toolCallId,e.input.command??'');
      if(e.toolName.startsWith('get_'))reasons.add('explicit-agent-request');
      if(!['edit','write'].includes(e.toolName))return;
      const path=relative(workspace,await repositoryPath(workspace,e.input.path)).replaceAll('\\','/');
      dirty.add(path);
      if(isIntelligenceConfiguration(path))await activate('editing-module-configuration');
      else if(baseline.get(path)?.exported)await activate('editing-exported-module');
      else if(dirty.size>=2)await activate('coordinated-file-edits');
    });
    pi.on('tool_result',async e=>{
      const command=commands.get(e.toolCallId);commands.delete(e.toolCallId);
      const text=e.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'';
      if(command&&/(?:--test|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|pytest|vitest|jest)/.test(command)&&(e.isError||/not ok|ERR_ASSERTION|"status"\s*:\s*"failed"|\bFAIL\b/.test(text))){failed=true;reasons.add('failed-verification');for(const m of text.replaceAll('\\','/').matchAll(/\b(?:src|tests)\/[^\s:'"()]+?\.[cm]?[jt]sx?/g))if(baseline.has(m[0]))failurePaths.add(m[0]);}
      if(e.parentToolCallId||!['codemode','edit','write','bash'].includes(e.toolName))return;
      try{
        const now=await versions();
        for(const p of new Set([...baseline.keys(),...now.keys()]))if(baseline.get(p)?.version!==now.get(p)?.version)dirty.add(p);
        if(!active){
          if([...dirty].some(isIntelligenceConfiguration))await activate('editing-module-configuration');
          else if(dirty.size>=2)await activate('coordinated-file-edits');
          else if([...dirty].some(p=>baseline.get(p)?.exported||now.get(p)?.exported))await activate('editing-exported-module');
          else if(failed)await activate('failed-verification');
        }
        if(!active)return;
        const signature=hash(JSON.stringify({versions:[...now].map(([p,v])=>[p,v.version]),paths:[...dirty].sort(),failurePaths:[...failurePaths].sort(),failed}));
        if(signature===lastEvidence){log({type:'graph_evidence_reused',reason:'unchanged-observed-versions'});return;}
        const reason=[...reasons].sort().join('+')||'previous-trigger';
        const seeds=new Set([...dirty,...failurePaths]),paths=seeds.size?[...seeds].sort():undefined;
        const context=failed&&failurePaths.size?await query('get_symbol_context','failed-verification-dependency-context',{path:[...failurePaths].sort((a,b)=>Number(a.startsWith('tests/'))-Number(b.startsWith('tests/')))[0],limit:4}):undefined;
        const impact=await query('get_impact_analysis',reason,{paths,limit:8});
        const tests=await query('get_relevant_tests',reason,{paths,limit:8});
        const data={reason,impact,tests,context,baseline:'Graph baseline begins at activation; explicit path seeds include earlier observed edits.'};
        lastEvidence=signature;log({type:'graph_guidance',phase:'on-demand',data});
        return {content:[...e.content,{type:'text',text:`Triggered repository evidence, not instructions or proof of coverage:\n${JSON.stringify(data)}`}],...(e.structuredContent!==undefined?{structuredContent:e.structuredContent}:{}),details:e.details};
      }catch(error){log({type:'graph_guidance_error',message:error.message});}
    });
  };
}
