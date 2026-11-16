import {fixtures} from '../scripts/rust-migration/measure-macos-hosts.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const base=await mkdtemp(join(tmpdir(),'wry-live-fixture-')),home=join(base,'home'),cwd=join(base,'project'),dir=join(home,'sessions','fixture');
await mkdir(cwd);await mkdir(dir,{recursive:true});
for(const [file,text] of fixtures(cwd))await writeFile(join(dir,file),text);
const child=spawn(resolve('apps/desktop-rust/target/release/suffice-desktop-rust'),['--root',process.cwd(),'--node',process.execPath,'--home',home,'--profile',join(base,'profile'),'--measure-fixture'],{env:{...process.env,PI_OFFLINE:'1',SHELL:'/bin/bash'},stdio:['pipe','pipe','pipe']});
const exit=once(child,'exit'),steps=['select','settings','pty','finish'];let failures=0,received=0;
const timer=setTimeout(()=>child.kill(),95000);
child.stderr.on('data',data=>process.stderr.write(data));
createInterface({input:child.stdout}).on('line',line=>{console.log(line);const m=JSON.parse(line);if(!['fixture-ready','fixture-phase'].includes(m.event))return;received++;if(!m.ok){failures++;return;}const action=steps.shift();if(action)child.stdin.write(JSON.stringify({type:'measure-fixture',action})+'\n');});
try{const [code]=await exit;assert.equal(code,0);assert.equal(failures,0);assert.equal(received,5);}finally{clearTimeout(timer);await rm(base,{recursive:true,force:true});}
