import {createFileKeyring} from '../../../packages/backend/src/vault/index.mjs';
import {redact} from '../../../packages/backend/src/byok/index.mjs';
import path from 'node:path';

// Settings > Models keys: thin IPC over the backend byok ops (keys.* / vault). Keys go in, never come back out: lists carry last-4 hints only.
export const createKeyring=dataDir=>createFileKeyring(path.join(dataDir,'vault.key'));
const PROVIDERS=['anthropic','openai','openrouter','openai-compatible'];
export function createKeysHandlers({call,keyring}){
 // Locked = the vault key file cannot be read, so sealed keys cannot be opened.
 const lock=()=>{try{keyring.current();return null;}catch(e){return e?.message||'Vault key unreadable';}};
 const safe=async(secret,fn)=>{try{return await fn();}catch(e){throw new Error(redact(e?.message||String(e),secret));}};
 const prov=p=>{if(!PROVIDERS.includes(p?.provider))throw new Error('Unknown provider');return p.provider;};
 return {
  'keys-list':async()=>{const reason=lock();if(reason)return {locked:true,reason,providers:PROVIDERS,keys:{}};return {locked:false,providers:PROVIDERS,keys:await call({type:'keys.hints'})};},
  'keys-set':p=>safe(p?.key,async()=>{await call({type:'keys.set',provider:prov(p),key:String(p.key??''),...(p.baseUrl&&{baseUrl:p.baseUrl})});return true;}),
  'keys-remove':p=>call({type:'keys.remove',provider:prov(p)}),
  'keys-test':p=>safe(p?.key,()=>call({type:'keys.test',provider:prov(p),...(p.baseUrl&&{baseUrl:p.baseUrl})})),
 };
}
