import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Type} from 'typebox';

export const EFFICIENCY_ARMS=Object.freeze([
  {id:'control',model:'gpt-6.1-sol'},
  {id:'compact',model:'gpt-6.1-sol',compactResponses:true},
  {id:'navigation',model:'gpt-6.1-sol',navigation:true},
  {id:'combined',model:'gpt-6.1-sol',compactResponses:true,navigation:true},
]);
export function compactObservation(name,data,ref){
  const footer=`\nFull observation: ${ref}`;
  if(name==='files'&&Array.isArray(data))return data.join('\n')+footer;
  if(name==='file_read'&&typeof data?.text==='string')return `${data.path} lines ${data.offset}-${data.offset+data.text.split('\n').length-1}/${data.totalLines}; omitted before=${data.omittedBefore}, after=${data.omittedAfter}\n${data.text}${footer}`;
  if(name==='search'&&Array.isArray(data))return (data.length?data.map(r=>`${r.path}:${r.line}: ${r.text}`).join('\n'):'No matches')+footer;
  if(['file_edit','file_write'].includes(name))return `${data.edited?'Edited':'Wrote'} ${data.path}; revision ${data.version?.slice(0,12)}${footer}`;
  if(name==='symbols'&&Array.isArray(data?.matches))return `Symbols: ${data.total}; omitted=${data.omitted}\n${data.matches.map(s=>`${s.path}:${s.start}-${s.end} ${s.kind} ${s.name}`).join('\n')}${data.unparsed.length?'\nUnparsed: '+data.unparsed.join(', '):''}${footer}`;
  if(name==='symbol_read'&&typeof data?.text==='string')return `${data.path} ${data.name} (${data.kind}) lines ${data.start}-${data.end}; symbol=${data.symbolStart}-${data.symbolEnd}; remaining=${data.remaining}\nImports:\n${data.imports.map(i=>i.text).join('\n')}\n${data.text}${footer}`;
  if(name==='symbol_references'&&Array.isArray(data?.references))return `Syntactic references: ${data.total}; omitted=${data.omitted}\n${data.references.map(r=>`${r.path}:${r.line}: ${r.text}`).join('\n')}${data.unparsed.length?'\nUnparsed: '+data.unparsed.join(', '):''}${footer}`;
  if(['test','check_cases'].includes(name)&&data&&typeof data.status==='string'){
    const counts=['tests','passed','failed','skipped','cancelled','todo'].map(k=>`${k}=${data[k]??'?'}`).join(' ');
    let out=`${data.status}; exit=${data.exitCode??'?'}; ${counts}`;
    if(data.truncated)out+='; original output truncated';
    if(data.errorCode)out+=`; error=${data.errorCode}`;
    if(data.status!=='passed'){
      const chunks=String(data.stdout??'').split(/(?=^# Subtest:)/m),failures=chunks.filter(s=>/^not ok /m.test(s));
      const diagnostics=(failures.length?failures.join('\n'):String(data.stdout??''));
      out+=`\n${diagnostics.slice(0,6000)}`;
      if(diagnostics.length>6000)out+='\n[diagnostics shortened; retrieve full observation]';
    }
    if(data.stderr){out+=`\nstderr: ${data.stderr.slice(0,3000)}`;if(data.stderr.length>3000)out+='\n[stderr shortened; retrieve full observation]';}
    return out+footer;
  }
  return data;
}
export function observationTools({tools,compact=false,directory,log=()=>{}}){
  const saved=new Map(),presentations=new Map();let serial=0;
  const wrapped=tools.map(tool=>({...tool,async execute(...args){
    const result=await tool.execute(...args),id=`o${++serial}`;
    const original=result.structuredContent??result.content;
    let complete=original;
    if(tool.name==='test'&&/^test-\d+\.json$/.test(original?.artifact??''))complete=JSON.parse(await readFile(resolve(directory,'../artifacts',original.artifact),'utf8'));
    const entry={id,tool:tool.name,args:args[1],data:complete};saved.set(id,entry);
    await mkdir(directory,{recursive:true});await writeFile(resolve(directory,`${id}.json`),JSON.stringify(entry));
    const delivered=compact?compactObservation(tool.name,original,id):original;
    log({type:'tool_observation',id,tool:tool.name,rawCharacters:JSON.stringify(original).length,deliveredCharacters:JSON.stringify(delivered).length,compacted:delivered!==original});
    if(delivered!==original)presentations.set(JSON.stringify(original),delivered);
    // Preserve the exact machine-readable API for JavaScript tool programs.
    return result;
  }}));
  wrapped.push({name:'observation_read',label:'observation_read',description:'Recover a full original tool observation by reference (o1, o2, ...), in 8000-character pages. Omit reference to list observations. Compact responses never delete originals.',parameters:Type.Object({reference:Type.Optional(Type.String()),offset:Type.Optional(Type.Integer({minimum:0}))}),outputSchema:Type.Unknown(),async execute(_id,{reference,offset=0}){
    let value;if(!reference)value=[...saved.values()].map(({id,tool})=>({id,tool}));
    else{const entry=saved.get(reference);if(!entry)throw new Error('Unknown observation reference');const text=JSON.stringify(entry.data);value={reference,offset,totalCharacters:text.length,text:text.slice(offset,offset+8000),remaining:Math.max(0,text.length-offset-8000)};}
    log({type:'observation_recovery',reference:reference??null,offset});return {structuredContent:value,content:[{type:'text',text:JSON.stringify(value)}],details:{}};
  }});
  const replace=value=>{
    const match=presentations.get(JSON.stringify(value));if(match!==undefined)return match;
    if(Array.isArray(value))return value.map(replace);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));
    return value;
  };
  const render=event=>{
    if(event.parentToolCallId)return;
    let changed=false;
    const content=event.content.map(item=>{
      if(!compact||item.type!=='text')return item;
      const pieces=item.text.split(/(^==> text \d+\/\d+ <==\r?\n)/m);
      const text=pieces.map(piece=>{
        try{const parsed=JSON.parse(piece),replacement=replace(parsed);
          if(JSON.stringify(replacement)!==JSON.stringify(parsed)){changed=true;return (typeof replacement==='string'?replacement:JSON.stringify(replacement))+(piece.endsWith('\n')?'\n':'');}
        }catch{/* Wrapper labels and free-form output remain byte-for-byte intact. */}
        return piece;
      }).join('');
      return text!==item.text?{...item,text}:item;
    });
    log({type:'response_presentation',tool:event.toolName,changed,rawCharacters:JSON.stringify(event.content).length,deliveredCharacters:JSON.stringify(content).length});
    return changed?{content,structuredContent:event.structuredContent}:undefined;
  };
  return {tools:wrapped,render};
}

export function providerFailureKind(errors){
  const text=(errors??[]).join('\n');
  // Service errors can contain the word subscription without being an auth failure.
  if(/\b50[0234]\b|service_unavailable|temporarily unavailable|stream ended before|overloaded/i.test(text))return 'transient';
  if(/\b40[13]\b|unauthoriz|authentication|invalid.*token|expired.*token|quota|usage.limit|insufficient|subscription.*(expired|required)|rate.limit/i.test(text))return 'authorization_or_limit';
  return text?'other':'none';
}
