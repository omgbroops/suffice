import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {readText,hash} from './workspace.mjs';import {indexJavaScript} from './symbol-navigation.mjs';
export const WORKFLOW_ARMS=[{id:'solo',worker:'gpt-6.1-sol',workflow:false},{id:'workflow-sol',worker:'gpt-6.1-sol',workflow:true},{id:'workflow-luna',worker:'gpt-6-luna',workflow:true}];
export function validateChecks(cases){
  if(!Array.isArray(cases)||!cases.length||cases.length>12||JSON.stringify(cases).length>12000)throw new Error('Provide 1-12 concise checks');
  for(const c of cases){
    if(!['load','loadAll','roundtrip','present','unpaired'].includes(c.operation))throw new Error('Unknown check operation');
    if(c.schema&&!['CORE_SCHEMA','JSON_SCHEMA','YAML11_SCHEMA'].includes(c.schema))throw new Error('Unknown schema');
    if(['load','loadAll','present','unpaired'].includes(c.operation)&&typeof c.source!=='string')throw new Error('Source string required');
    if(['load','loadAll'].includes(c.operation)&&!Object.hasOwn(c,'expected')&&!c.throws)throw new Error('Expected value or throws required');
    if(c.operation==='roundtrip'&&!Object.hasOwn(c,'value'))throw new Error('Roundtrip value required');
    if(c.lineWidth!==undefined&&(!Number.isInteger(c.lineWidth)||c.lineWidth<10||c.lineWidth>200))throw new Error('Invalid line width');
  }
  return structuredClone(cases);
}
export function checksSource(cases){
  validateChecks(cases);
  return `import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const y=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href);
const cases=${JSON.stringify(cases)};
test('declared behavioral checks',()=>{for(const c of cases){const schema=y[c.schema??'CORE_SCHEMA'],options={schema};const run=()=>{
if(c.operation==='load'||c.operation==='loadAll'){assert.deepEqual(y[c.operation](c.source,options),c.expected);}
else if(c.operation==='roundtrip'){assert.deepEqual(y.load(y.dump(c.value,options),options),c.value);}
else if(c.operation==='present'){const docs=y.eventsToAst(y.parseEvents(c.source,{}),{source:c.source,schema});const rendered=y.present(docs,{schema,lineWidth:c.lineWidth??80});assert.deepEqual(y.loadAll(rendered,options),y.loadAll(c.source,options));}
else if(c.operation==='unpaired'){const events=y.parseEvents(c.source,{});const index=events.findLastIndex(e=>e.type===y.EVENT_SCALAR);assert.ok(index>=0);events.splice(index,1);assert.throws(()=>y.constructFromEvents(events,{source:c.source}),y.YAMLException);assert.throws(()=>y.eventsToAst(events,{source:c.source,schema}));}
};if(c.throws){assert.ok(['load','loadAll'].includes(c.operation));assert.throws(()=>y[c.operation](c.source,options));}else assert.doesNotThrow(run);}});
`;
}
export function validateContract(contract,sourceFiles){
  if(!contract||typeof contract!=='object'||JSON.stringify(contract).length>16000)throw new Error('Contract too large');
  for(const key of ['requirements','steps','invariants'])if(!Array.isArray(contract[key])||!contract[key].length||contract[key].length>8||contract[key].some(v=>typeof v!=='string'||v.length>900))throw new Error(`Invalid ${key}`);
  if(!Array.isArray(contract.files)||!contract.files.length||contract.files.length>8||new Set(contract.files).size!==contract.files.length||contract.files.some(p=>!sourceFiles.includes(p)))throw new Error('Choose 1-8 existing production paths');
  if(contract.symbols!==undefined&&(!Array.isArray(contract.symbols)||contract.symbols.length>12||contract.symbols.some(s=>!contract.files.includes(s.path)||typeof s.name!=='string')))throw new Error('Invalid symbol anchors');
  return {...structuredClone(contract),checks:validateChecks(contract.checks)};
}
export async function buildPacket(workspace,contract){
  let remaining=22000;const excerpts=[],versions={};
  for(const path of contract.files){
    const source=await readText(workspace,path);versions[path]=hash(source);let indexed;try{indexed=indexJavaScript(source,path);}catch{indexed={symbols:[],imports:[]};}
    const anchors=(contract.symbols??[]).filter(a=>a.path===path),lines=source.split('\n');
    const selected=anchors.map(a=>indexed.symbols.find(s=>s.name===a.name)).filter(Boolean);
    const ranges=selected.length?selected.map(s=>({name:s.name,start:s.start,end:s.end})).slice(0,3):[{name:'file-start',start:1,end:Math.min(80,lines.length)}];
    for(const r of ranges){const complete=lines.slice(r.start-1,r.end).map((l,i)=>`${r.start+i}: ${l}`).join('\n');const text=complete.slice(0,Math.min(6000,remaining));remaining-=text.length;excerpts.push({path,version:versions[path],...r,text,omittedCharacters:complete.length-text.length});}
    const imports=indexed.imports.map(i=>i.text).join('\n').slice(0,2000);if(imports&&remaining>0){const text=imports.slice(0,remaining);excerpts.push({path,kind:'imports',text});remaining-=text.length;}
  }
  return {contract,versions,excerpts,notice:'Source excerpts may be incomplete. Use navigation/read tools to expand; source versions must be checked before editing. The contract is a proposed plan, not a guarantee of correctness.'};
}
export async function verifyPacket(workspace,packet){const stale=[];for(const [path,version]of Object.entries(packet.versions))if(hash(await readFile(resolve(workspace,path)))!==version)stale.push(path);return {current:stale.length===0,stale};}
export function conciseTests(result){return {status:result.status,tests:result.tests,passed:result.passed,failed:result.failed,exitCode:result.exitCode,diagnostics:result.status==='passed'?'':`${result.stdout??''}\n${result.stderr??''}`.slice(0,8000)};}
