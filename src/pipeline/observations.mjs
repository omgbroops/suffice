import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {openSync, writeSync, closeSync} from 'node:fs';
import {mkdir, realpath, open} from 'node:fs/promises';
import {resolve, relative, isAbsolute, dirname, basename} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {Type} from 'typebox';

const inside=(parent,path)=>{const r=relative(parent,path);return r===''||(!r.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&r!=='..'&&!isAbsolute(r));};
const integer=(value,min,max,name)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`Invalid ${name}`);return value;};
const diagnostic=/\b(error|failed|failure|fatal|exception|panic|warning|assertion|timeout|aborted)\b|\bTS\d{3,}\b/i;

// Resolve existing ancestors too: an outside-looking symlink must not write logs into the repo.
async function futureRealpath(path) {
  try{return await realpath(path);}catch(error){
    if(error.code!=='ENOENT')throw error;
    const parent=dirname(path);if(parent===path)throw error;
    return resolve(await futureRealpath(parent),basename(path));
  }
}

class Preview {
  constructor(maxChars){this.limit=maxChars;this.head='';this.tail='';this.lines=[];this.carry='';this.bytes=0;this.newlines=0;this.decoder=new StringDecoder('utf8');}
  append(chunk){
    const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    this.bytes+=b.length;
    for(const byte of b)if(byte===10)this.newlines++;
    this.appendText(this.decoder.write(b));
  }
  appendText(text){
    const headLimit=Math.floor(this.limit*.25),tailLimit=Math.floor(this.limit*.3);
    this.head=(this.head+text).slice(0,headLimit);
    this.tail=(this.tail+text).slice(-tailLimit);
    // A single enormous line never accumulates unboundedly in memory.
    const parts=(this.carry+text).split(/\r?\n/);
    this.carry=parts.pop().slice(-512);
    for(const line of parts)if(diagnostic.test(line)){
      this.lines.push(line.slice(0,512));
      if(this.lines.length>4)this.lines.shift();
    }
  }
  finish(){this.appendText(this.decoder.end());if(diagnostic.test(this.carry))this.lines.push(this.carry.slice(0,512));this.lines=this.lines.slice(-4);}
  format(header){
    const diagnostics=this.lines.join('\n').slice(0,Math.floor(this.limit*.25));
    return `${header}\n[head]\n${this.head}\n[... middle omitted; complete original retained ...]\n${diagnostics?`[diagnostics; may overlap head/tail]\n${diagnostics}\n`:''}[tail]\n${this.tail}`.slice(0,this.limit);
  }
}

/**
 * Opt-in output presentation and recoverable byte capture. No tool is changed until wrapped.
 *
 * Integration:
 *   const observation=createObservationController({workspace,artifactDir});
 *   const tools=createCodingTools(workspace,{bash:{shellPath,exposeSessionEnvironment:false,
 *     operations:observation.wrapBashOperations(createLocalBashOperations({shellPath}))}});
 *   const observed=[...observation.wrapTools(tools),observation.readTool];
 *
 * Native codemode gets bash's original structuredContent. To bound script printouts too, call
 * await observation.presentResult(event,{kind:'codemode'}) in the codemode tool_result hook,
 * returning its content/details. This must be applied AFTER scripts consume nested tool results.
 */
export function createObservationController({artifactDir,workspace,maxChars=6000,maxReadBytes=8192}={}) {
  if(!artifactDir||!workspace)throw new Error('artifactDir and workspace are required');
  integer(maxChars,800,100000,'maxChars');integer(maxReadBytes,256,65536,'maxReadBytes');
  const base=resolve(artifactDir),repo=resolve(workspace),scope=new AsyncLocalStorage(),records=new Map();
  if(inside(repo,base))throw new Error('Observation artifacts must be outside the actor repository');
  let ready;
  const prepare=()=>ready??=(async()=>{
    const [actualRepo,actualBase]=await Promise.all([futureRealpath(repo),futureRealpath(base)]);
    if(inside(actualRepo,actualBase))throw new Error('Observation artifacts must be outside the actor repository');
    await mkdir(base,{recursive:true,mode:0o700});
  })();
  const create=async(kind)=>{
    await prepare();
    const id=randomUUID(),path=resolve(base,`${id}.log`);
    return {id,path,kind,fd:openSync(path,'wx',0o600),preview:new Preview(maxChars),captured:false};
  };
  const append=(record,data)=>{
    const buffer=Buffer.isBuffer(data)?data:Buffer.from(data);
    if(record.captureError)return;
    try{
      // onData is synchronous in Pi's operations API; bounded writes preserve ordering.
      let offset=0;while(offset<buffer.length){
        const written=writeSync(record.fd,buffer,offset,buffer.length-offset);
        if(written<=0)throw new Error('Output artifact write made no progress');
        offset+=written;
      }
      record.preview.append(buffer);record.captured=true;
    }catch(error){record.captureError=error;}
  };
  const finish=record=>{
    record.preview.finish();
    closeSync(record.fd);record.fd=undefined;
    if(record.captureError)throw new Error('Could not preserve complete command output',{cause:record.captureError});
    records.set(record.id,record);
  };
  const metadata=record=>({id:record.id,kind:record.kind,bytes:record.preview.bytes,newlines:record.preview.newlines,complete:true});
  const header=(record,status='')=>`[${record.kind} output: ${record.preview.bytes} bytes; ${record.preview.newlines} newline characters${status?`; ${status}`:''}. Retrieve complete output with command_output({id:"${record.id}",offset:0}).]`;
  const compact=(result,record,{partial=false,status=''}={})=>{
    if(!result||!Array.isArray(result.content))return result;
    const text=result.content.filter(c=>c.type==='text').map(c=>c.text??'').join('\n');
    if(text.length<=maxChars&&(!record||record.preview.bytes<=maxChars))return result;
    const preview=record?.captured?record.preview:new Preview(maxChars);
    if(!record?.captured){preview.append(Buffer.from(text));preview.finish();}
    const title=partial?'[Command running; bounded preview. Complete output will be retained when execution finishes.]':header(record,status);
    let inserted=false;
    const content=result.content.flatMap(c=>{
      if(c.type!=='text')return [c];
      if(inserted)return [];
      inserted=true;return [{...c,text:preview.format(title)}];
    });
    return {...result,content,details:{...result.details,...(!partial?{observation:metadata(record)}:{observation:{partial:true}})}};
  };
  const controller={
    /** Wrap the same operations instance passed to the native bash factory. */
    wrapBashOperations(operations){
      return {...operations,async exec(command,cwd,options){
        const record=scope.getStore();
        if(!record)throw new Error('Observed bash operations require wrapTool around their bash tool');
        record.intercepted=true;
        const result=await operations.exec(command,cwd,{...options,onData:data=>{
          append(record,data);options.onData?.(data);
        }});
        record.exitCode=result.exitCode;
        if(record.captureError)throw new Error('Could not preserve complete command output',{cause:record.captureError});
        return result;
      }};
    },
    wrapTools(tools){return tools.map(tool=>controller.wrapTool(tool));},
    wrapTool(tool){
      if(tool.name!=='bash')return tool;
      return {...tool,async execute(id,args,signal,onUpdate,...rest){
        const record=await create('bash');
        return scope.run(record,async()=>{
          try{
            const result=await tool.execute(id,args,signal,onUpdate?partial=>{
              const bounded=compact(partial,record,{partial:true});
              // Streaming observations have no programmatic consumer. Do not leak raw structured
              // output if a future native implementation starts attaching it to updates.
              const {structuredContent,...update}=bounded??{};
              onUpdate(update);
            }:undefined,...rest);
            // Refuse a false complete-output claim if operations interception was omitted.
            if(!record.captured&&typeof result?.structuredContent?.output==='string'){
              if(result.structuredContent.truncated||result.details?.fullOutputPath)throw new Error('Full capture requires wrapBashOperations');
              append(record,Buffer.from(result.structuredContent.output));
            }
            finish(record);
            const status=`exit=${result?.structuredContent?.exit_code??record.exitCode??'unknown'}${result?.isError?'; error=true':''}`;
            const presented=compact(result,record,{status});
            return {...presented,details:{...presented?.details,observation:metadata(record)}};
          }catch(error){
            if(record.fd!==undefined)finish(record);
            if(record.captureError)throw error;
            if(!record.intercepted&&!record.captured)throw new Error('Full capture requires wrapBashOperations',{cause:error});
            const original=error instanceof Error?error:new Error(String(error));
            const status=signal?.aborted?'cancelled=true':/timed out|timeout/i.test(original.message)?'timeout=true':'error=true';
            // Preserve error identity and custom properties; do not append an unbounded original.
            original.message=(record.preview.bytes>maxChars?record.preview.format(header(record,status)):original.message.slice(0,maxChars-250)+`\n${header(record,status)}`).slice(0,maxChars);
            original.observation={...metadata(record),status,errorName:original.name,...(original.code!==undefined?{errorCode:original.code}:{})};
            throw original;
          }
        });
      }};
    },
    /** Presentation boundary for codemode, whose scripts must retain original structured data. */
    async presentResult(result,{kind='codemode'}={}){
      const text=result?.content?.filter(c=>c.type==='text').map(c=>c.text??'').join('\n')??'';
      if(text.length<=maxChars)return result;
      const record=await create(kind);append(record,Buffer.from(text));finish(record);
      return compact(result,record,{status:result.isError?'error=true':''});
    },
    /** Coordinator-side receipts; paths are intentionally not accepted as retrieval inputs. */
    artifacts(){return [...records.values()].map(record=>({...metadata(record),path:record.path}));},
  };
  controller.readTool={
    name:'command_output',label:'Command output',
    description:'Read complete retained command/script output by opaque id. Byte offsets; bounded pages. Optional literal search returns the first matching byte offset at or after offset. Use base64 for exact arbitrary bytes.',
    parameters:Type.Object({id:Type.String(),offset:Type.Optional(Type.Integer({minimum:0})),maxBytes:Type.Optional(Type.Integer({minimum:1,maximum:maxReadBytes})),search:Type.Optional(Type.String({minLength:1,maxLength:256})),encoding:Type.Optional(Type.Union([Type.Literal('utf8'),Type.Literal('base64')]))}),
    outputSchema:Type.Object({id:Type.String(),output:Type.String(),offset:Type.Number(),next_offset:Type.Number(),eof:Type.Boolean(),byte_length:Type.Number(),encoding:Type.String(),match_offset:Type.Optional(Type.Number())}),
    async execute(_id,{id,offset=0,maxBytes=Math.min(maxReadBytes,Math.floor(maxChars*.5)),search,encoding='utf8'},signal){
      const record=records.get(id);
      if(!record)throw new Error('Unknown output artifact id');
      integer(offset,0,Number.MAX_SAFE_INTEGER,'offset');integer(maxBytes,1,maxReadBytes,'maxBytes');
      if(!['utf8','base64'].includes(encoding))throw new Error('Invalid encoding');
      if(search!==undefined&&(typeof search!=='string'||!search.length||search.length>256))throw new Error('Invalid literal search');
      const file=await open(record.path,'r');
      try{
        const size=(await file.stat()).size;
        let position=Math.min(offset,size),match;
        if(search!==undefined){
          const term=Buffer.from(search),buffer=Buffer.alloc(65536);let carry=Buffer.alloc(0);
          while(position<size){
            signal?.throwIfAborted();
            const {bytesRead}=await file.read(buffer,0,buffer.length,position);if(!bytesRead)break;
            const joined=Buffer.concat([carry,buffer.subarray(0,bytesRead)]),found=joined.indexOf(term);
            if(found>=0){match=position-carry.length+found;position=match;break;}
            carry=Buffer.from(joined.subarray(Math.max(0,joined.length-term.length+1)));position+=bytesRead;
          }
          if(match===undefined)position=size;
        }
        signal?.throwIfAborted();
        const buffer=Buffer.alloc(maxBytes),{bytesRead}=await file.read(buffer,0,maxBytes,position);
        const output={id,output:buffer.subarray(0,bytesRead).toString(encoding),offset:position,next_offset:position+bytesRead,eof:position+bytesRead>=size,byte_length:size,encoding,...(match!==undefined?{match_offset:match}:{})};
        return {content:[{type:'text',text:JSON.stringify(output)}],structuredContent:output};
      }finally{await file.close();}
    },
  };
  return controller;
}
