import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readFile,realpath} from 'node:fs/promises';
import {sessionArtifactName,sessionNativeArtifactFiles} from '../../scripts/rust-migration/session-native-artifact.mjs';

const require=createRequire(import.meta.url);
const defaultDirectory=fileURLToPath(new URL('./native/',import.meta.url));
const loaded=new Map(),pending=new Map(),poisoned=new Set();
const missing=()=>Error('Experimental session addon is missing or not built; run session:native:build');
const restart=()=>Error('Restart the process after rebuilding or preloading the session addon');

async function verifiedHash(directory,file){
 if(!(await sessionNativeArtifactFiles(directory)).length)throw missing();
 return JSON.parse(await readFile(file+'.json','utf8')).sha256;
}

async function verifiedLoad(directory,file,key){
 if(poisoned.has(key))throw restart();
 const prior=loaded.get(key);let attemptedRequire=false;
 try{
  const hash=await verifiedHash(directory,file);
  if(await realpath(file)!==key||poisoned.has(key))throw restart();
  // Only this loader may attest to the native bytes behind a CommonJS entry.
  // An earlier external require has no verifiable binding-to-receipt history.
  const cached=require.cache[key];
  if(prior){
   if(prior.hash!==hash||cached!==prior.module||cached?.exports!==prior.binding)throw restart();
   return prior.binding;
  }
  if(cached)throw restart();
  attemptedRequire=true;
  const binding=require(key),module=require.cache[key];
  const after=await verifiedHash(directory,file);
  if(after!==hash||await realpath(file)!==key||poisoned.has(key)||!module||require.cache[key]!==module||module.exports!==binding)throw restart();
  loaded.set(key,{hash,module,binding});
  return binding;
 }catch(error){
  // A failed preflight before dlopen can be retried after a valid build.
  // Once mapped, the identity remains uncertain until the process exits.
  if(prior||attemptedRequire||require.cache[key])poisoned.add(key);
  throw error;
 }
}

export async function loadDesktopBinding(directory=defaultDirectory){
 const file=join(directory,sessionArtifactName());
 let key;
 try{key=await realpath(file);}catch(error){if(error.code==='ENOENT')throw missing();throw error;}
 // CommonJS caches native modules by canonical path. Serialize validations and
 // loads on that same identity, including callers through directory aliases.
 const previous=pending.get(key)??Promise.resolve();
 const work=previous.catch(()=>{}).then(()=>verifiedLoad(directory,file,key));
 pending.set(key,work);
 try{return await work;}finally{if(pending.get(key)===work)pending.delete(key);}
}
