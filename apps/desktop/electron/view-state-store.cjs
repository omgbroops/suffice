const {mkdir,readdir,readFile,open,rename,unlink,stat}=require('node:fs/promises');
const {join}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const valid=key=>typeof key==='string'&&/^suffice-thread-view-v1:(new|[a-f0-9]{32}|pending:[a-f0-9-]{36})$/.test(key);
const limit=2*1024*1024;
exports.createViewStateStore=(directory,{delayMs=250}={})=>{
 let tail=Promise.resolve(),timer;const queued=new Map();
 const file=key=>{if(!valid(key))throw new Error('Invalid thread view key');return join(directory,createHash('sha256').update(key).digest('hex')+'.json');};
 async function write(key,value){
  const path=file(key);if(value===null){await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});return;}
  await mkdir(directory,{recursive:true,mode:0o700});const temporary=path+'.'+randomUUID()+'.tmp';let handle;
  try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify({key,value}));await handle.sync();await handle.close();handle=null;await rename(temporary,path);}finally{await handle?.close();await unlink(temporary).catch(()=>{});}
 }
 function flush(){
  clearTimeout(timer);timer=null;const batch=[...queued];queued.clear();
  if(!batch.length)return tail;
  const job=tail.then(async()=>{for(const [key,item] of batch){try{await write(key,item.value);for(const waiter of item.waiters)waiter.resolve();}catch(error){for(const waiter of item.waiters)waiter.reject(error);throw error;}}});
  tail=job.catch(error=>{for(const [,item] of batch)for(const waiter of item.waiters)waiter.reject(error);});return job;
 }
 return {flush,
  async load(){
   await flush();const result={};let names;try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')return result;throw error;}
   let bytes=0;for(const name of names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).slice(0,5000)){
    try{const path=join(directory,name),info=await stat(path);if(info.size>limit*2+1000||bytes+info.size>32*1024*1024)continue;bytes+=info.size;const record=JSON.parse(await readFile(path,'utf8'));if(valid(record.key)&&typeof record.value==='string'&&record.value.length<=limit)result[record.key]=record.value;}catch{/* Retain other recoverable states if one backup was damaged. */}
   }return result;
  },
  save({key,value}={}){
   try{file(key);if(value!==null){if(typeof value!=='string'||Buffer.byteLength(value)>limit)throw new Error('Invalid thread view state');const state=JSON.parse(value);if(!state||typeof state!=='object'||Array.isArray(state)||typeof state.draft!=='string')throw new Error('Invalid thread view state');}}catch(error){return Promise.reject(error);}
   return new Promise((resolve,reject)=>{const item=queued.get(key)||{waiters:[]};item.value=value;item.waiters.push({resolve,reject});queued.set(key,item);if(!timer)timer=setTimeout(()=>void flush().catch(()=>{}),delayMs);});
  }
 };
};
