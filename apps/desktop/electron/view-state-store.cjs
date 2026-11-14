const {mkdir,readdir,readFile,open,rename,unlink,stat}=require('node:fs/promises');
const {join}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const valid=key=>typeof key==='string'&&/^suffice-thread-view-v1:(new|[a-f0-9]{32}|pending:[a-f0-9-]{36})$/.test(key);
const limit=2*1024*1024;
exports.createViewStateStore=directory=>{
 let tail=Promise.resolve();
 const file=key=>{if(!valid(key))throw new Error('Invalid thread view key');return join(directory,createHash('sha256').update(key).digest('hex')+'.json');};
 return {
  async load(){
   await tail;const result={};let names;try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')return result;throw error;}
   let bytes=0;for(const name of names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).slice(0,5000)){
    try{const path=join(directory,name),info=await stat(path);if(info.size>limit*2+1000||bytes+info.size>32*1024*1024)continue;bytes+=info.size;const record=JSON.parse(await readFile(path,'utf8'));if(valid(record.key)&&typeof record.value==='string'&&record.value.length<=limit)result[record.key]=record.value;}catch{/* Retain other recoverable states if one backup was damaged. */}
   }return result;
  },
  save({key,value}={}){
   let path;try{path=file(key);if(value!==null){if(typeof value!=='string'||Buffer.byteLength(value)>limit)throw new Error('Invalid thread view state');const state=JSON.parse(value);if(!state||typeof state!=='object'||Array.isArray(state)||typeof state.draft!=='string')throw new Error('Invalid thread view state');}}catch(error){return Promise.reject(error);}
   const job=tail.then(async()=>{
    if(value===null){await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});return;}
    await mkdir(directory,{recursive:true,mode:0o700});const temporary=path+'.'+randomUUID()+'.tmp';let handle;
    try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify({key,value}));await handle.sync();await handle.close();handle=null;await rename(temporary,path);}finally{await handle?.close();await unlink(temporary).catch(()=>{});}
   });tail=job.catch(()=>{});return job;
  }
 };
};
