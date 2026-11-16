import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const bin=resolve(root,'crates/suffice-session/target/debug/suffice-session'+(process.platform==='win32'?'.exe':''));
const fixtures=[
  undefined,null,true,false,0,-1.9,8640000000000000,8640000000000001,
  '', '2024','2024-02','2024-02-29','2023-02-29','2020-02-30','0001-01-00','0001-01-32','01/02/0001','000049',
  '2020-01-01T00:00','2020-01-01t12:34:56.000z','2020-01-01T24:00:00Z','2020-01-01T24:01:00Z',
  '2020-01-01T12:34:56.123987Z','2020-01-01T12:34:56+05:30','2020-01-01T12:34:56-0530',
  '+275760-09-13T00:00:00.000Z','+275760-09-13T00:00:00.001Z','-271821-04-20T00:00:00.000Z','-000000-01-01','-271821-01-01','-000001-01-00',
  '+275760-09-12T12:00:00','-271821-04-20T12:00:00','+020000-07-15T12:00:00','-020000-01-15T12:00:00',
  '2024-03-10T02:30:00','2024-11-03T01:30:00','2024-07-01T12:00:00',
  '0','1','12','13','49','50','99','100','2020/02/30','1/2/20','2020-1-1',
  'Jan 2 2020','02 Jan 2020 12:34:56 GMT','Thu, 02 Jan 2020 12:34:56 -0500',
  [],[null],[1],[[2020]],['2020-01-01'],[2020,1,1],{}, {toString:1},[{toString:null}], 'nonsense', 'é'
];
for(const tz of ['UTC','America/New_York','Asia/Kolkata']) test(`Date conversion against Node in ${tz}`,()=>{
 const env={...process.env,TZ:tz};
 const oracle=spawnSync(process.execPath,['-e',`const inputs=JSON.parse(process.argv[1]);for(const input of inputs){try{let d=input.missing?new Date(undefined):new Date(input.value);console.log(JSON.stringify({ok:true,result:Number.isNaN(d.getTime())?null:d.getTime()}))}catch(e){console.log(JSON.stringify({ok:false}))}}`,JSON.stringify(fixtures.map(value=>value===undefined?{missing:true}:{value}))],{encoding:'utf8',env,timeout:10000});
 assert.equal(oracle.status,0,oracle.stderr);
 const expected=oracle.stdout.trim().split('\n').map(JSON.parse);
 fixtures.forEach((value,i)=>{
  const input=value===undefined?{op:'date'}:{op:'date',value};
  const child=spawnSync(bin,{input:JSON.stringify(input),encoding:'utf8',env,timeout:10000});
  assert.equal(child.status,0,child.stderr);
  const got=JSON.parse(child.stdout);
  assert.equal(got.ok,expected[i].ok,`${tz} ${JSON.stringify(value)} ${child.stdout}`);
  if(got.ok) assert.equal(got.result,expected[i].result,`${tz} ${JSON.stringify(value)}`);
 });
});
