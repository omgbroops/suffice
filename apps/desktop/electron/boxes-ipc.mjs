import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBoxes} from '../../../packages/backend/src/boxes/index.mjs';

// Cloud boxes behind the Boxes tab. Config: SUFFICE_BOXES_URL + SUFFICE_BOXES_TOKEN, else <home>/boxes.json {baseUrl, token}.
export function boxesConfig(home,env=process.env){
 let file={};try{file=JSON.parse(readFileSync(resolve(home,'boxes.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('boxes.json is not valid JSON');}
 const baseUrl=env.SUFFICE_BOXES_URL||file.baseUrl,token=env.SUFFICE_BOXES_TOKEN||file.token;
 return baseUrl&&token?{baseUrl,token}:null;
}
const client=home=>{const c=boxesConfig(home);return c&&createBoxes({...c,fetch:globalThis.fetch,clock:{now:Date.now}});};
const need=(home)=>{const b=client(home);if(!b)throw new Error('Boxes are not connected');return b;};
const slim=o=>({id:o.id,name:o.name||o.id,state:o.state||o.status||'',created:o.created_at||o.created||null});
export async function boxesList(home){const b=client(home);if(!b)return {connected:false,boxes:[]};return {connected:true,boxes:(await b.list()).map(slim)};}
export async function boxCheckpoints(home,id){return (await need(home).checkpoints(id)).map(slim);}
// Restore rewinds the box in place; the server keeps the pre-rewind state as its own checkpoint.
export async function boxRestore(home,id,checkpoint){await need(home).rewind(id,checkpoint);return {checkpoints:await boxCheckpoints(home,id)};}
export async function boxFork(home,id,checkpoint){const made=await need(home).fork(id,{checkpointId:checkpoint});return slim(made);}
