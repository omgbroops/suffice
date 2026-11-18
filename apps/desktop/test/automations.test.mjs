import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createAutomations,nextCron,parseCron,pushFingerprint,fileFingerprint} from '../electron/automations.mjs';

const at=(y,mo,d,h=0,mi=0)=>new Date(y,mo-1,d,h,mi).getTime();
const git=(cwd,...args)=>execFileSync('git',args,{cwd,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}}).toString();

test('cron parsing and next-run maths',()=>{
 assert.equal(nextCron('0 9 * * *',at(2026,11,18,8,30)),at(2026,11,18,9));
 assert.equal(nextCron('0 9 * * *',at(2026,11,18,9)),at(2026,11,19,9));
 assert.equal(nextCron('*/15 * * * *',at(2026,11,18,9,1)),at(2026,11,18,9,15));
 assert.equal(nextCron('30 8 * * 1-5',at(2026,11,20,9)),at(2026,11,23,8,30)); // Fri -> Mon
 assert.equal(nextCron('0 0 29 2 *',at(2026,11,1)),at(2028,2,29)); // leap day
 assert.equal(nextCron('0 0 * * 7',at(2026,11,18)),at(2026,11,22)); // 7 = Sunday
 for(const bad of ['','* * * *','61 * * * *','*/0 * * * *','a b c d e','5-2 * * * *'])assert.throws(()=>parseCron(bad),bad);
 assert.throws(()=>nextCron('0 0 31 2 *',at(2026,1,1)),/never runs/);
});

async function setup(){
 const home=await mkdtemp(resolve(tmpdir(),'suffice-auto-')),project=await mkdtemp(resolve(tmpdir(),'suffice-auto-proj-')),clock={t:at(2026,11,18,8)},runs=[];
 const make=(overrides={})=>createAutomations({home,now:()=>clock.t,projectPaths:async()=>[project],run:async item=>{runs.push(item.name);return {threadId:'t'+runs.length};},cooldownMs:0,...overrides});
 return {home,project,clock,runs,make};
}
const daily={name:'Morning',prompt:'Check deps',trigger:{kind:'daily',time:'09:00'}};

test('scheduled automation fires once per slot on a fake clock and records last/next run',async()=>{
 const {project,clock,runs,make}=await setup(),svc=make();
 const created=await svc.create({...daily,project});assert.equal(created.nextRun,at(2026,11,18,9));
 await svc.tick();await svc.idle();assert.deepEqual(runs,[]);
 clock.t=at(2026,11,18,9,0);await svc.tick();await svc.idle();assert.deepEqual(runs,['Morning']);
 await svc.tick();await svc.idle();assert.equal(runs.length,1); // same slot never fires twice
 const [item]=await svc.list();assert.equal(item.lastRun.status,'ok');assert.equal(item.lastRun.threadId,'t1');assert.equal(item.nextRun,at(2026,11,19,9));
 clock.t=at(2026,11,19,9,5);await svc.tick();await svc.idle();assert.equal(runs.length,2);
 await svc.update(item.id,{...daily,project,trigger:{kind:'hourly',minute:30}});assert.equal((await svc.list())[0].nextRun,at(2026,11,19,9,30));
});

test('disabled automations do not run; enabling recomputes from now without a catch-up burst',async()=>{
 const {project,clock,runs,make}=await setup(),svc=make(),{id}=await svc.create({...daily,project});
 await svc.toggle(id,false);assert.equal((await svc.list())[0].nextRun,null);
 clock.t=at(2026,11,20,12);await svc.tick();await svc.idle();assert.equal(runs.length,0);
 await svc.toggle(id,true);assert.equal((await svc.list())[0].nextRun,at(2026,11,21,9));await svc.tick();await svc.idle();assert.equal(runs.length,0);
});

test('state survives a restart; one missed run is caught up; an interrupted run is marked',async()=>{
 const {home,project,clock,runs,make}=await setup(),first=make(),{id}=await first.create({...daily,project});
 first.stop();
 clock.t=at(2026,11,21,10); // app was closed across three 09:00 slots
 const second=make();assert.equal((await second.list()).length,1);
 await second.tick();await second.idle();assert.equal(runs.length,1);assert.equal((await second.list())[0].nextRun,at(2026,11,22,9));
 // a crash mid-run leaves status "running" on disk
 const {readFile,writeFile}=await import('node:fs/promises'),file=resolve(home,'automations.json'),data=JSON.parse(await readFile(file,'utf8'));data[0].lastRun.status='running';await writeFile(file,JSON.stringify(data));
 const third=make();assert.match((await third.list())[0].lastRun.error,/restart/);assert.equal((await third.list())[0].id,id);
});

test('run errors are recorded and never throw out of the scheduler',async()=>{
 const {project,clock,make}=await setup(),svc=make({run:async()=>{throw new Error('Connect a provider in Settings first');}});
 await svc.create({...daily,project});clock.t=at(2026,11,18,9);await svc.tick();await svc.idle();
 const [item]=await svc.list();assert.equal(item.lastRun.status,'error');assert.match(item.lastRun.error,/Connect a provider/);
});

test('validation rejects bad input at the boundary',async()=>{
 const {project,make}=await setup(),svc=make();
 for(const [bad,message] of [[{...daily,project:'/nope'},/Project not found/],[{...daily,project,name:' '},/Name/],[{...daily,project,prompt:''},/Prompt/],[{...daily,project,trigger:{kind:'cron',cron:'nope'}},/five cron fields/],[{...daily,project,trigger:{kind:'daily',time:'25:00'}},/time/],[{...daily,project,trigger:{kind:'x'}},/when/],[{...daily,project,model:'m'},/together/],[{...daily,project,effort:'extreme'},/effort/]])
  await assert.rejects(svc.create(bad),message);
 assert.equal((await svc.list()).length,0);
});

test('git push trigger fires on a real push, not on commit or fetch',async()=>{
 const {project,clock,runs,make}=await setup(),bare=await mkdtemp(resolve(tmpdir(),'suffice-auto-bare-'));
 git(bare,'init','--bare','-q');git(project,'init','-q','-b','main');git(project,'remote','add','origin',bare);
 await writeFile(resolve(project,'a.txt'),'1');git(project,'add','.');git(project,'commit','-qm','one');
 const svc=make();await svc.create({name:'On push',prompt:'Review',project,trigger:{kind:'push'}});
 clock.t+=1000;await svc.tick();await svc.idle();assert.equal(runs.length,0); // baseline
 await writeFile(resolve(project,'a.txt'),'2');git(project,'commit','-qam','two');clock.t+=1000;await svc.tick();await svc.idle();assert.equal(runs.length,0); // commit alone
 git(project,'push','-q','origin','main');clock.t+=1000;await svc.tick();await svc.idle();assert.equal(runs.length,1);
 clock.t+=1000;await svc.tick();await svc.idle();assert.equal(runs.length,1); // not twice
 git(project,'fetch','-q','origin');clock.t+=1000;await svc.tick();await svc.idle();assert.equal(runs.length,1); // fetch alone
 await writeFile(resolve(project,'a.txt'),'3');git(project,'commit','-qam','three');git(project,'push','-q','origin','main');
 clock.t+=1000;await svc.tick();await svc.idle();assert.equal(runs.length,2);
 assert.notEqual(await pushFingerprint(project),'');assert.equal(await pushFingerprint('/definitely/not/a/repo'),'');
});

test('file change trigger fires on edits, skips ignored folders, honours cooldown',async()=>{
 const {project,clock,runs,make}=await setup(),svc=make({cooldownMs:60000});
 await mkdir(resolve(project,'node_modules'));await writeFile(resolve(project,'src.js'),'a');
 await svc.create({name:'Watch',prompt:'Lint',project,trigger:{kind:'file'}});
 await svc.tick();await svc.idle();assert.equal(runs.length,0);
 await writeFile(resolve(project,'node_modules/x.js'),'ignored');clock.t+=120000;await svc.tick();await svc.idle();assert.equal(runs.length,0);
 await writeFile(resolve(project,'src.js'),'changed');await utimes(resolve(project,'src.js'),new Date(),new Date(Date.now()+5000));
 clock.t+=120000;await svc.tick();await svc.idle();assert.equal(runs.length,1);
 await writeFile(resolve(project,'new.js'),'n'); // inside cooldown: held, then fires once it passes
 clock.t+=10000;await svc.tick();await svc.idle();assert.equal(runs.length,1);
 clock.t+=120000;await svc.tick();await svc.idle();assert.equal(runs.length,2);
 assert.match(await fileFingerprint(project),/^\d+:\d+:\d+$/);
});

test('a failed create or edit leaves the list and the file exactly as they were',async()=>{
 const {project,make}=await setup(),svc=make();
 const weekday=await svc.create({name:'Weekday',prompt:'p',project,trigger:{kind:'cron',cron:'30 8 * * 1-5'}});
 await assert.rejects(svc.create({name:'Ghost',prompt:'p',project,trigger:{kind:'cron',cron:'5 4 31 2 *'}}),/never runs/);
 assert.deepEqual((await svc.list()).map(item=>item.name),['Weekday']);
 await assert.rejects(svc.update(weekday.id,{name:'Weekday',prompt:'p',project,trigger:{kind:'cron',cron:'0 0 31 2 *'}}),/never runs/);
 const [kept]=await svc.list();assert.equal(kept.trigger.cron,'30 8 * * 1-5');
 await svc.toggle(weekday.id,false);assert.equal((await svc.toggle(weekday.id,true)).enabled,true);
});

test('two instances sharing one home keep each other\'s writes, also when they write at once',async()=>{
 const {home,project,make}=await setup(),one=make(),two=make();
 await two.list();await one.create({...daily,name:'From one',project});await two.create({...daily,name:'From two',project});
 const names=async svc=>(await svc.list()).map(item=>item.name).sort();
 assert.deepEqual(await names(one),['From one','From two']);assert.deepEqual(await names(two),['From one','From two']);
 await Promise.all([one.create({...daily,name:'A',project}),two.create({...daily,name:'B',project})]);
 assert.deepEqual(await names(one),['A','B','From one','From two']);
 assert.equal(JSON.parse(await readFile(resolve(home,'automations.json'),'utf8')).length,4);
});
