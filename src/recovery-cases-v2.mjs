import {checksSource,validateChecks} from './workflow-policy.mjs';
export function recoveryCasesSource(cases){
 if(!Array.isArray(cases)||!cases.length||cases.length>12)throw new Error('Expected 1-12 cases');
 const custom=cases.filter(c=>['finalizedSequence','finalizedMapping'].includes(c.operation));
 if(!custom.length)return checksSource(validateChecks(cases));
 if(custom.length!==cases.length)throw new Error('Separate finalized and ordinary assertions into separate calls');
 for(const c of custom){if(typeof c.source!=='string'||c.source.length>8000||JSON.stringify(c).length>12000)throw new Error('Invalid bounded finalized case');if(c.aliasKeys&&(!Array.isArray(c.aliasKeys)||c.aliasKeys.length!==2||c.aliasKeys.some(k=>typeof k!=='string')))throw new Error('aliasKeys needs two strings');}
 return `import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';const y=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href);
${custom.map((c,i)=>`test('finalized case ${i}',()=>{const c=${JSON.stringify(c)};const seq=c.operation==='finalizedSequence';const tag=seq?y.defineSequenceTag('!immutable',{create:()=>[],addItem:(a,x)=>{a.push(x)},finalize:a=>Object.freeze({items:Object.freeze([...a])}),identify:x=>!!x?.items,represent:x=>x.items}):y.defineMappingTag('!immutable',{create:()=>new Map(),addPair:(m,k,v)=>{m.set(k,v);return ''},has:(m,k)=>m.has(k),keys:r=>r.entries.map(([k])=>k),get:(r,k)=>r.entries.find(([key])=>key===k)?.[1],finalize:m=>Object.freeze({entries:Object.freeze([...m])}),identify:x=>!!x?.entries,represent:x=>new Map(x.entries)});const options={schema:y.CORE_SCHEMA.withTags(tag)};if(c.throws){assert.throws(()=>y.load(c.source,options),y.YAMLException);return;}const value=y.load(c.source,options);assert.deepEqual(value,c.expected);if(c.aliasKeys)assert.equal(value[c.aliasKeys[0]],value[c.aliasKeys[1]]);});`).join('\n')}`;
}
