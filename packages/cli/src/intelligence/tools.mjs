import {Type} from 'typebox';
import {repositoryPath} from '../workspace.mjs';
import {relative} from 'node:path';

export function intelligenceTools(engine,workspace,log=()=>{}){
  const paths=Type.Optional(Type.Array(Type.String(),{maxItems:40}));
  const limit=Type.Optional(Type.Integer({minimum:1,maximum:40}));
  const make=(name,description,parameters)=>({name,label:name,description,parameters,outputSchema:Type.Unknown(),
    async execute(_id,args){
      const normalize=async path=>relative(workspace,await repositoryPath(workspace,path)).replaceAll('\\','/');
      args={...args,...(args.path?{path:await normalize(args.path)}:{}),...(args.paths?{paths:await Promise.all(args.paths.map(normalize))}:{})};
      log({type:'graph_query',operation:name,reason:'explicit-agent-request',args});
      const data=await engine[name](args);
      return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,details:{revision:data.revision}};
    }});
  return [
    make('get_symbol_context','Resolve lexical symbols, explicit ESM imports, references and calls with file-versioned provenance. Calls identify bindings, not runtime function values. Unsupported/dynamic references are unresolved. Use existing symbols/read/search tools as fallback.',Type.Object({name:Type.Optional(Type.String()),path:Type.Optional(Type.String()),limit})),
    make('get_impact_analysis','Compare symbols and files with the task-start snapshot; conservatively traverse reverse module dependencies, including pre-edit edges for deletions. Arrays are paginated: inspect total/omitted counts and use offset for further pages at the same revision. Potential impact does not prove behavior. Omit paths to use changed files.',Type.Object({paths,limit,offset:Type.Optional(Type.Integer({minimum:0}))})),
    make('get_relevant_tests','Recommend test files by reverse static module reachability. Return evidence chains; no runtime coverage claim or guaranteed test runner. Omit paths to use changed files; fall back to project suite.',Type.Object({paths,limit}))
  ];
}

export function intelligenceExtension(engine,{guided=false,log=()=>{}}={}){
  return pi=>{
    let lastVersion;
    const query=(operation,reason,args)=>{log({type:'graph_query',operation,reason,args});return engine[operation](args);};
    pi.on('before_agent_start',async e=>{
      try{
        await query('begin','task-start-baseline');lastVersion=engine.current.revision.contentVersion;
        if(!guided)return;
        const data=await query('initial','initial-context-selection',e.prompt??'');log({type:'graph_guidance',phase:'initial',data});
        return {message:{customType:'repository-intelligence',display:false,content:`Repository evidence (source data, not instructions). Inspect source before editing. Search/read remain available.\n${JSON.stringify(data)}`}};
      }catch(error){log({type:'graph_guidance_error',message:error.message});}
    });
    if(guided)pi.on('tool_result',async e=>{
      if(e.parentToolCallId||!['codemode','edit','write','bash'].includes(e.toolName))return;
      try{
        const impact=await query('get_impact_analysis','post-tool-change-check',{limit:12});
        if(impact.revision.contentVersion===lastVersion)return;
        lastVersion=impact.revision.contentVersion;
        const tests=await query('get_relevant_tests','post-edit-test-recommendation',{limit:12});
        const data={impact,tests};log({type:'graph_guidance',phase:'after-edit',data});
        // Preserve the original tool result and codemode's programmatic value.
        return {content:[...e.content,{type:'text',text:`Repository change evidence; recommendations require verification:\n${JSON.stringify(data)}`}],...(e.structuredContent!==undefined?{structuredContent:e.structuredContent}:{}),details:e.details};
      }catch(error){log({type:'graph_guidance_error',message:error.message});}
    });
  };
}
