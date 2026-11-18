import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBudget,createFileStore} from '../../../packages/backend/src/budget/index.mjs';

// Caps live in <home>/budget-caps.json (0 or absent = no cap); window spend in <home>/budget.json via the backend file store.
const file=home=>resolve(home,'budget-caps.json');
export function readCaps(home){
  let raw={};try{raw=JSON.parse(readFileSync(file(home),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const n=v=>Number.isFinite(v)&&v>0?Math.floor(v):0;
  return {weeklyTokens:n(raw.weeklyTokens),runTokens:n(raw.runTokens)};
}
export function writeCaps(home,input){
  for(const k of ['weeklyTokens','runTokens'])if(!Number.isFinite(input?.[k])||input[k]<0)throw new Error(`${k} must be a number >= 0`);
  mkdirSync(home,{recursive:true});const caps={weeklyTokens:Math.floor(input.weeklyTokens),runTokens:Math.floor(input.runTokens)};
  writeFileSync(file(home),JSON.stringify(caps));return caps;
}
export const weeklyBudget=(home,clock={now:()=>Date.now()})=>{
  const {weeklyTokens}=readCaps(home);
  return createBudget({clock,store:createFileStore(resolve(home,'budget.json')),limits:weeklyTokens?[{name:'weekly',period:'week',tokens:weeklyTokens}]:[]});
};
export const budgetState=home=>({caps:readCaps(home),weekly:weeklyBudget(home).status()[0]??null});
// Turn gate: throws the backend's reason when the weekly window is spent. Returns a recorder for the run's token delta.
export function gateTurn(home){
  const b=weeklyBudget(home),d=b.check(1);if(!d.allow)throw new Error(`Stopped: weekly cap reached. ${d.reason}`);
  return tokens=>{if(tokens>0)b.record({inputTokens:tokens,outputTokens:0});};
}
