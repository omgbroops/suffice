import {createFileKeyring} from '../../../packages/backend/src/vault/index.mjs';
import {redact} from '../../../packages/backend/src/byok/index.mjs';
import path from 'node:path';
import fs from 'node:fs';

// Settings > Models keys: thin IPC over the backend byok ops (keys.* / vault). Keys go in, never come back out: lists carry last-4 hints only.
// A missing key file next to sealed keys must lock the vault: the file keyring would silently mint a new key and orphan them.
export function createKeyring(dataDir){
 const file=path.join(dataDir,'vault.key'),inner=createFileKeyring(file);
 const sealed=()=>{try{return fs.readdirSync(path.join(dataDir,'vault'),{recursive:true,withFileTypes:true}).some(d=>d.isFile());}catch{return false;}};
 const guard=f=>(...a)=>{if(!fs.existsSync(file)&&sealed())throw new Error('Vault key file is missing; saved keys cannot be opened');return f(...a);};
 return {...inner,current:guard(inner.current),rotate:guard(inner.rotate)};
}
const PROVIDERS=['anthropic','openai','openrouter','openai-compatible'];
export function createKeysHandlers({call,keyring}){
 // Locked = the vault key file cannot be read, so sealed keys cannot be opened.
 const lock=()=>{try{keyring.current();return null;}catch(e){return e?.message||'Vault key unreadable';}};
 const safe=async(secret,fn)=>{try{return await fn();}catch(e){throw new Error(redact(e?.message||String(e),secret));}};
 const prov=p=>{if(!PROVIDERS.includes(p?.provider))throw new Error('Unknown provider');return p.provider;};
 return {
  'keys-list':async()=>{const reason=lock();if(reason)return {locked:true,reason,providers:PROVIDERS,keys:{}};return {locked:false,providers:PROVIDERS,keys:await call({type:'keys.hints'})};},
  'keys-set':p=>safe(p?.key,async()=>{if(p?.provider==='openai-compatible'&&!p.baseUrl)throw new Error('openai-compatible needs a Base URL');await call({type:'keys.set',provider:prov(p),key:String(p.key??''),...(p.baseUrl&&{baseUrl:p.baseUrl})});return true;}),
  'keys-remove':p=>call({type:'keys.remove',provider:prov(p)}),
  'keys-test':p=>safe(p?.key,()=>call({type:'keys.test',provider:prov(p),...(p.baseUrl&&{baseUrl:p.baseUrl})})),
 };
}
