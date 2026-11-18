import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBestOfN} from '../electron/best-of-n.mjs';

function fixtureRepo(){
 const dir=mkdtempSync(join(tmpdir(),'bon-repo-')),git=(...args)=>execFileSync('git',['-C',dir,...args],{stdio:'pipe'});
 git('init','-q','-b','main');git('config','user.email','t@example.com');git('config','user.name','t');
 writeFileSync(join(dir,'package.json'),JSON.stringify({scripts:{test:"node -e \"process.exit(require('fs').existsSync('feature.txt')?0:1)\""}}));
 writeFileSync(join(dir,'README.md'),'# hi\n');git('add','-A');git('commit','-qm','init');return dir;
}
const fake=async({cwd,model})=>{
 if(model==='bad')throw new Error('provider offline');
 if(model==='a')writeFileSync(join(cwd,'feature.txt'),'x\ny\n');else writeFileSync(join(cwd,'README.md'),'# changed\n');
 return {text:model+' done',usage:{estimatedApiUsd:model==='a'?0.5:0.25}};
};
const candidates=names=>names.map(model=>({model,provider:'fake',effort:'off'}));

test('compare runs candidates in isolated worktrees and keep applies only the chosen one',{timeout:60000},async()=>{
 const project=fixtureRepo(),directory=mkdtempSync(join(tmpdir(),'bon-wt-')),bon=createBestOfN({directory,runCandidate:fake});
 const {id,results}=await bon.run({project,prompt:'do it',candidates:candidates(['a','b','bad'])});
 assert.deepEqual(results.map(r=>[r.status,r.files,r.added,r.removed,r.tests]),[['done',1,2,0,'pass'],['done',1,1,1,'fail'],['failed',0,0,0,'none']]);
 assert.deepEqual(results.map(r=>r.usd),[0.5,0.25,null]);
 assert.match(results[2].error,/offline/);
 assert.equal(existsSync(join(project,'feature.txt')),false,'project untouched while comparing');
 const {applied}=await bon.keep(id,0);
 assert.equal(applied,true);
 assert.equal(readFileSync(join(project,'feature.txt'),'utf8'),'x\ny\n');
 assert.equal(readFileSync(join(project,'README.md'),'utf8'),'# hi\n','the other answers are discarded');
 assert.deepEqual(readdirSync(directory),[]);
 assert.doesNotMatch(execFileSync('git',['-C',project,'worktree','list'],{encoding:'utf8'}),/compare-/);
 await assert.rejects(()=>bon.keep(id,0),/no longer open/);
});

test('discard removes every worktree and leaves the project unchanged; bad input is refused',{timeout:60000},async()=>{
 const project=fixtureRepo(),directory=mkdtempSync(join(tmpdir(),'bon-wt-')),bon=createBestOfN({directory,runCandidate:fake});
 const {id}=await bon.run({project,prompt:'do it',candidates:candidates(['a','b'])});
 assert.equal(await bon.discard(id),true);
 assert.deepEqual(readdirSync(directory),[]);
 assert.equal(execFileSync('git',['-C',project,'status','--porcelain'],{encoding:'utf8'}),'');
 await assert.rejects(()=>bon.run({project,prompt:'x',candidates:candidates(['a'])}),/two or three/);
 await assert.rejects(()=>bon.run({project,prompt:' ',candidates:candidates(['a','b'])}),/prompt/);
 await assert.rejects(()=>bon.run({project:null,prompt:'x',candidates:candidates(['a','b'])}),/project/);
});
