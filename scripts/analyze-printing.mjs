// Offline saved-transcript analysis. Never evaluates codemode programs.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('../..','suffice');
const audit=JSON.parse(await readFile(resolve(root,'reports/CONTEXT-WASTE-AUDIT.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(root,'reports/context-waste-input-manifest.json'),'utf8'));
const rows=audit.rows.filter(r=>['evidence-record','nemotron-retrieval'].includes(r.root));
const digest=s=>createHash('sha256').update(s).digest('hex');
const outputs=[],sources=[],inputs=[];let messages=0,modelResponses=0,rawSource=0,rawAll=0,manifestMatched=0,formattingCandidateCharacters=0;
for(const r of rows){
 const partition=/pilot|screen/.test(r.campaign)?'development':'heldout-descriptive-only';
 for(const f of r.sources.filter(f=>f.endsWith('transcript.json'))){
  const bytes=await readFile(resolve(root,f));const hash=digest(bytes); const entry=manifest.files.find(x=>x.path===f);
  if(entry?.sha256===hash)manifestMatched++;else throw Error('Manifest mismatch '+f);
  inputs.push({reference:f,sha256:hash,partition});
  const ms=JSON.parse(bytes);const seen=new Set();let priorSource=0;
  for(let i=0;i<ms.length;i++){
   const m=ms[i];if(m.role==='assistant'){modelResponses++;continue;}if(m.role!=='toolResult')continue;
   messages++;const blocks=(m.content??[]).filter(c=>c.type==='text').map(c=>c.text??'');const text=blocks.join('\n');
   const ref=f+'#message='+i;let sourceChars=0,serializedSourceChars=0,overlap=0;
   for(let bi=0;bi<blocks.length;bi++)for(const [li,line] of blocks[bi].split('\n').entries()){
    let o;try{o=JSON.parse(line);}catch{continue;}
    if(!o||typeof o!=='object'||typeof o.text!=='string'||typeof o.path!=='string'||(!Number.isInteger(o.offset)&&!Number.isInteger(o.symbolStart)))continue;
    const {text:sourceText,...metadata}=o;formattingCandidateCharacters+=JSON.stringify(metadata).length+1+sourceText.length;
    const lines=o.text.split('\n');let repeated=0,numberedChars=0;
    for(const l of lines){const match=/^(\d+): (.*)$/.exec(l);if(!match)continue;numberedChars+=l.length;const key=JSON.stringify([o.path,o.version,match[1],match[2]]);if(o.version&&seen.has(key))repeated+=l.length;if(o.version)seen.add(key);}
    const item={reference:ref+'&block='+bi+'&line='+li,attempt:r.root+'/'+r.campaign+'/'+r.run,partition,path:o.path,version:o.version??null,offset:o.offset,totalLines:o.totalLines??null,omittedBefore:o.omittedBefore??null,omittedAfter:o.omittedAfter??null,decodedCharacters:o.text.length,serializedCharacters:line.length,serializationAndMetadataCharacters:line.length-o.text.length,numberedCharacters:numberedChars,previousIdenticalLineCharacters:repeated,followingAssistantResponses:ms.slice(i+1).filter(x=>x.role==='assistant').length,sourceSha256:digest(o.text)};
    Object.assign(item,{name:o.name??null,start:o.start??null,end:o.end??null,symbolStart:o.symbolStart??null,symbolEnd:o.symbolEnd??null,remaining:o.remaining??null,importsCount:o.imports?.length??null});
    sources.push(item);sourceChars+=o.text.length;serializedSourceChars+=line.length;overlap+=repeated;
   }
   outputs.push({reference:ref,attempt:r.root+'/'+r.campaign+'/'+r.run,partition,visibleCharacters:text.length,sourceCharacters:sourceChars,serializedSourceCharacters:serializedSourceChars,previousIdenticalLineCharacters:overlap,nestedCalls:(m.nestedCalls?.calls??[]).map(c=>({name:c.name,status:c.status,path:c.arguments?.path??null}))});priorSource+=sourceChars;
  }
 }
 for(const [name,v]of Object.entries(r.toolSizes)){rawAll+=v.rawCharacters;if(['file_read','symbol_read'].includes(name))rawSource+=v.rawCharacters;}
}
const sum=(a,k)=>a.reduce((s,x)=>s+x[k],0);
const summary={attempts:rows.length,transcripts:inputs.length,manifestMatched,toolResultMessages:messages,modelResponses,visibleCharacters:sum(outputs,'visibleCharacters'),identifiedSourceObjects:sources.length,identifiedDecodedSourceCharacters:sum(sources,'decodedCharacters'),identifiedSerializedSourceCharacters:sum(sources,'serializedCharacters'),serializationAndMetadataCharacters:sum(sources,'serializationAndMetadataCharacters'),previousIdenticalLineCharacters:sum(sources,'previousIdenticalLineCharacters'),appendOnlySourceCharacterExposures:sources.reduce((s,x)=>s+x.decodedCharacters*x.followingAssistantResponses,0),rawPrimitiveCharacters:rawAll,rawFileAndSymbolReadCharacters:rawSource,partitions:Object.fromEntries(['development','heldout-descriptive-only'].map(p=>[p,{attempts:rows.filter(r=>(/pilot|screen/.test(r.campaign)?'development':'heldout-descriptive-only')===p).length,sourceObjects:sources.filter(s=>s.partition===p).length,sourceCharacters:sum(sources.filter(s=>s.partition===p),'decodedCharacters')}]))};
summary.formattingCandidateCharacters=formattingCandidateCharacters;
summary.formattingCandidateCharacterReduction=summary.identifiedSerializedSourceCharacters-formattingCandidateCharacters;
const result={mode:'offline static analysis; no program or model execution',summary,inputs,largestSourceOutputs:[...outputs].sort((a,b)=>b.sourceCharacters-a.sourceCharacters).slice(0,15),largestSourceObjects:[...sources].sort((a,b)=>b.decodedCharacters-a.decodedCharacters).slice(0,20),sources};
await writeFile('reports/PRINTING-ANALYSIS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
