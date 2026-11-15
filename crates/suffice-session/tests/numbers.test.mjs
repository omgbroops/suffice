import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSessionProjection} from '@earendil-works/pi-coding-agent';

const crate=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const binary=resolve(crate,'target/debug/suffice-session'+(process.platform==='win32'?'.exe':''));
const request=text=>{const result=spawnSync(binary,{input:text,encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};

test('raw wire matches JSON.parse/stringify at finite numeric boundaries',()=>{
 const literals=['-0','0.0','1.0','1e-7','1e-6','1e20','1e21','9007199254740993','-9007199254740993','18446744073709551615','18446744073709551616','1000000000000000100','1.0000000000000001','5e-324','2.2250738585072014e-308','1.7976931348623157e308'];
 const source=`{"type":"fixture","values":[${literals.join(',')}]}`;
 const actual=request(JSON.stringify({op:'journal',source}));
 assert.equal(actual,JSON.stringify({ok:true,result:[JSON.parse(source)]}));
});

test('seeded finite double corpus uses the same raw decimal wire as JavaScript',()=>{
 let state=0x1234abcd9876fedcn;
 const buffer=Buffer.alloc(8),values=[];
 for(let i=0;i<2048;i++){
  state=BigInt.asUintN(64,state^(state<<13n));state=BigInt.asUintN(64,state^(state>>7n));state=BigInt.asUintN(64,state^(state<<17n));
  buffer.writeBigUInt64LE(state);const number=buffer.readDoubleLE();if(Number.isFinite(number))values.push(number);
 }
 const source=JSON.stringify({type:'fixture',values});
 assert.equal(request(JSON.stringify({op:'journal',source})),JSON.stringify({ok:true,result:[JSON.parse(source)]}));
});

test('numeric session IDs use JavaScript Number identity after parsing',()=>{
 const source='[{"type":"message","id":1,"parentId":null,"message":{"role":"user","content":"old"}},{"type":"message","id":1.0,"parentId":null,"message":{"role":"user","content":"chosen"}},{"type":"message","id":2,"parentId":1,"message":{"role":"assistant","content":[]}}]';
 const entries=JSON.parse(source),projection=buildSessionProjection(entries);
 const expected=JSON.parse(JSON.stringify({...projection,entries:projection.entries.map(entry=>({sourceIndex:entries.indexOf(entry.sourceEntry),messages:entry.messages}))}));
 assert.deepEqual(JSON.parse(request(`{"op":"project","entries":${source}}`)).result,expected);
});

test('tool argument display uses exact two-space JSON.stringify numeric formatting',()=>{
 const args=JSON.parse('{"z":9007199254740993,"2":-0,"1":1e21,"small":1e-7,"decimal":1.0,"large":1e20}');
 const entries=[{type:'message',id:'a',parentId:null,message:{role:'assistant',content:[{type:'toolCall',id:'t',name:'read',arguments:args}]}}];
 const actual=JSON.parse(request(JSON.stringify({op:'present',entries})));assert.equal(actual.ok,true,actual.error);
 assert.equal(actual.result.messages[0].content[0].text,JSON.stringify(args,null,2));
});
