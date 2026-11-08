import {readFile,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {repositoryPath,hash} from './workspace.mjs';

const reads=new Set(['read','file_read','symbol_read']),writes=new Set(['edit','write','file_edit','file_write']);
const eligible=path=>/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)&&!/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./.test(path);

/** Ordinary tool adapter. The optional Pi bridge flushes at the codemode result,
 * so scripts cannot accidentally discard packets by projecting `.text`. */
export function implicitToolAdapter({workspace,tools,context=false,impact=false,verification=false,mode='semantic',maxPacketTokens=400,maxTotalTokens=1200,maxFiles=6,deferToCodemode=false,log=()=>{},onDispose,engineFactory}={}){
  if(!context&&!impact&&!verification)return {tools,onToolResult:()=>undefined,dispose:()=>{}};
  let enginePromise;const pending=new Map(),parents=new Map();
  const engine=()=>enginePromise??=(async()=>{
    const Factory=engineFactory??(await import('./implicit/context.mjs')).ImplicitSemanticContext;
    const value=new Factory({workspace,mode,context,impact,verification,maxPacketTokens,maxTotalTokens,maxFiles,log:e=>log({...e,packetProposed:e.packetDelivered,packetDelivered:false})});onDispose?.(()=>value.dispose());return value;
  })();
  const source=async path=>{const file=await repositoryPath(workspace,path);if((await stat(file)).size>128*1024)throw new Error('Implicit input exceeds 128 KiB');return {path:relative(resolve(workspace),file).replaceAll('\\','/'),text:await readFile(file,'utf8')};};
  const dispatch=async(record,alreadyNoted=false)=>{
    const e=await engine();
    if(record.event==='read')return alreadyNoted?e.analyze({event:'read',path:record.path,span:{startLine:record.startLine,endLine:record.endLine},expectedHash:hash(record.source)}):e.read(record);
    return e.edit(record);
  };
  const reportDelivery=(record,packet,parentCallId,extraTokens)=>log({type:'implicit_delivery',tool:record.tool,callId:record.id,parentCallId,path:record.path,event:record.event,packetDelivered:true,text:packet.text,tokens:packet.tokens,visibleTokens:packet.visibleTokens,extraToolResultTokens:extraTokens,revision:packet.revision,keys:packet.keys,deliveredFacts:packet.deliveredFacts,plan:packet.plan});
  const wrapped=tools.map(tool=>!reads.has(tool.name)&&!writes.has(tool.name)?tool:{...tool,async execute(id,args,...rest){
    let before;
    try{if(eligible(String(args.path??'').replaceAll('\\','/')))before=await source(args.path);else log({type:'implicit_context',event:reads.has(tool.name)?'read':'edit',path:args.path,reason:'irrelevant_path',packetDelivered:false});}catch(error){log({type:'implicit_context',path:args.path,reason:'input_fallback',packetDelivered:false,error:error.message});}
    const result=await tool.execute(id,args,...rest);if(!before||result.isError)return result;
    try{
      const after=await source(args.path),data=result.structuredContent;let record;
      if(reads.has(tool.name)){
        if(hash(before.text)!==hash(after.text)||data?.version&&data.version!==hash(after.text)){log({type:'implicit_context',path:after.path,reason:'stale_operation_fallback',staleDetected:true,packetDelivered:false});return result;}
        const startLine=data?.start??data?.offset??args.offset??1,truncation=result.details?.truncation;
        let returnedLines=0;
        if(truncation?.firstLineExceedsLimit)returnedLines=0;
        else if(Number.isInteger(truncation?.outputLines))returnedLines=truncation.outputLines;
        else if(typeof data?.text==='string')returnedLines=data.text.split('\n').length;
        else{
          const observed=typeof data==='string'?data:result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'',visible=observed.split('\n'),actual=after.text.split('\n');
          while(returnedLines<visible.length&&startLine-1+returnedLines<actual.length&&visible[returnedLines]===actual[startLine-1+returnedLines])returnedLines++;
        }
        const endLine=data?.end??startLine+returnedLines-1;
        if(endLine<startLine){log({type:'implicit_context',path:after.path,reason:'no_source_span',packetDelivered:false});return result;}
        record={id,tool:tool.name,event:'read',path:after.path,source:after.text,startLine,endLine};
      }else record={id,tool:tool.name,event:'edit',path:after.path,before:before.text,after:after.text};
      if(deferToCodemode){if(pending.size<32)pending.set(id,record);else log({type:'implicit_context',path:after.path,reason:'pending_event_limit',packetDelivered:false});return result;}
      const packet=await dispatch(record);if(!packet)return result;
      const {countTokens}=await import('./implicit/tokens.mjs'),updated={...result,content:[...result.content,{type:'text',text:packet.text}]};
      if(tool.outputSchema&&data&&typeof data==='object'&&!Array.isArray(data))updated.structuredContent={...data,context:packet.text};
      const old=tool.outputSchema?data:result.content,next=tool.outputSchema?updated.structuredContent:updated.content;
      reportDelivery(record,packet,null,countTokens(JSON.stringify(next))-countTokens(JSON.stringify(old)));return updated;
    }catch(error){log({type:'implicit_context',path:before.path,reason:'analysis_fallback',packetDelivered:false,error:error.message});return result;}
  }});
  const onToolResult=async event=>{
    if(!deferToCodemode)return;
    const record=pending.get(event.toolCallId);
    if(record){pending.delete(event.toolCallId);if(event.parentToolCallId){const list=parents.get(event.parentToolCallId)??[];if(list.length<32)list.push(record);parents.set(event.parentToolCallId,list);}else if(!event.isError){try{const packet=await dispatch(record);if(packet){reportDelivery(record,packet,null,packet.visibleTokens);return {content:[...event.content,{type:'text',text:packet.text}],details:event.details};}}catch(error){log({type:'implicit_context',event:record.event,path:record.path,reason:'analysis_fallback',packetDelivered:false,error:error.message});}}}
    if(event.toolName!=='codemode'||!parents.has(event.toolCallId))return;
    const records=parents.get(event.toolCallId);parents.delete(event.toolCallId);
    try{
      const e=await engine(),grouped=new Map();
      for(const record of records){
        if(record.event==='read')e.noteRead(record);
        const prior=grouped.get(record.path);
        if(record.event==='edit')grouped.set(record.path,{...record,before:prior?.event==='edit'?prior.before:record.before});
        else if(!prior)grouped.set(record.path,record);
      }
      const content=[...event.content];let added=0;
      const {countTokens}=await import('./implicit/tokens.mjs');
      for(const record of grouped.values()){
        const packet=await dispatch(record,true);if(!packet)continue;
        content.push({type:'text',text:packet.text});const extra=countTokens(JSON.stringify(content))-countTokens(JSON.stringify(event.content))-added;added+=extra;reportDelivery(record,packet,event.toolCallId,extra);
      }
      if(content.length!==event.content.length)return {content,details:event.details};
    }catch(error){log({type:'implicit_context',event:'codemode',reason:'analysis_fallback',packetDelivered:false,error:error.message});}
  };
  return {tools:wrapped,onToolResult,async dispose(){try{(await enginePromise)?.dispose();}catch{}finally{pending.clear();parents.clear();}}};
}
