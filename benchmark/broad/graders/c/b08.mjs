import assert from 'node:assert/strict';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
const moduleUrl = new URL('../index.js', import.meta.url).href;
const echo = "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(s))";
const values = ['payload-one','payload with spaces\nand newline'];
const cases = [
 ['stdin scalar',{stdin:'inherit'}],
 ['stdin array',{stdin:['inherit']}],
 ['stdio scalar',{stdio:'inherit'}],
 ['stdio array',{stdio:['inherit','pipe','pipe']}],
 ['pipe control',{stdin:'pipe'}],
];
let failures=0;
for (const sync of [false,true]) for(const [name,option] of cases) for(const input of values) {
 const options={...option,input,timeout:1500,...('stdio' in option ? {} : {stdout:'pipe',stderr:'pipe'})};
 const code=`import {execa,execaSync} from ${JSON.stringify(moduleUrl)};const result=await ${sync?'execaSync':'execa'}(process.execPath,['-e',${JSON.stringify(echo)}],${JSON.stringify(options)});if(result.stdout!==undefined)process.stdout.write(result.stdout);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{input:'inherited data must not replace explicit input',encoding:'utf8',timeout:4000});
 try {assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,input);console.log('PASS',sync?'sync':'async',name);}
 catch(error) {failures++;console.error('FAIL',sync?'sync':'async',name,error.message);}
}
assert.equal(failures,0,`${failures} inherited-input contract cases failed`);
