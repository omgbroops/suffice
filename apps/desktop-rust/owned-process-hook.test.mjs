import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const root = fileURLToPath(new URL('../../',import.meta.url));
const host = path.join(process.env.CARGO_TARGET_DIR || path.join(root,'apps/desktop-rust/target'),'debug/examples/guardian_fixture');
const check = async (fn, what) => {
  const deadline = Date.now()+7500;
  while (Date.now()<deadline) {
    const result = await fn();
    if (result) return result;
    await delay(30);
  }
  assert.fail('Timed out waiting for '+what);
};
const alive = pid => {try {process.kill(pid,0); return true;}catch {return false;}};
const pidFile = async name => {
  try {return Number((await readFile(name,'utf8')).trim());}catch {return 0;}
};
test('macOS guardian registers real preload, detached shell, fork IPC and interactive PTY jobs before exec', {skip:process.platform!=='darwin',timeout:90000},async t=>{
  execFileSync('cargo',['build','--locked','--manifest-path',path.join(root,'apps/desktop-rust/Cargo.toml'),'--example','guardian_fixture'],{stdio:'pipe'});
  for(const end of ['host SIGKILL','bridge SIGKILL','graceful stop']){
    await t.test(end,async()=>{
      const dir=await mkdtemp(path.join(tmpdir(),'suffice-owned-'));
      const preload=path.join(dir,'pre load.cjs'), script=path.join(dir,'bridge.cjs'), ipc=path.join(dir,'fork.cjs');
      await writeFile(preload,`if(process.argv[1]===process.env.BRIDGE_FIXTURE){
        const child=require('node:child_process').spawn('/bin/sh',['-c','sleep 22 & echo $! > "$TEST_DIR/preload-child"'],{detached:true,stdio:'ignore'});
        child.unref();
      }`);
      await writeFile(ipc,'process.on("message", message=>{process.send(message);});');
      await writeFile(script,`const {spawn,fork}=require('node:child_process'), fs=require('node:fs'), path=require('node:path');
        const dir=process.env.TEST_DIR;
        const child=fork(path.join(dir,'fork.cjs'),[],{detached:true,stdio:['ignore','ignore','ignore','ipc']});
        child.on('message',reply=>{if(reply==='ready')fs.writeFileSync(path.join(dir,'fork'),String(child.pid))});child.send('ready');
        const ordinary=spawn('/bin/sleep',['22'],{stdio:'ignore'});fs.writeFileSync(path.join(dir,'ordinary'),String(ordinary.pid));
        const pty=require('node:module').createRequire(path.join(process.env.CHECKOUT,'package.json'))('node-pty');
        const shell=pty.spawn('/bin/bash',['--noprofile','--norc','-i'],{cwd:dir,env:{...process.env,PS1:'> '}});
        shell.onData(()=>{});fs.writeFileSync(path.join(dir,'shell'),String(shell.pid));
        shell.write('sleep 22 & echo $! > bg; sleep 22\\r');
        setInterval(()=>{},1000);`);
      const sentinel=spawn('/bin/sleep',['24'],{stdio:'ignore'});
      const driver=spawn(host,[root,process.execPath,script],{env:{...process.env,CHECKOUT:root,TEST_DIR:dir,BRIDGE_FIXTURE:script,NODE_OPTIONS:'--require '+JSON.stringify(preload)},stdio:['pipe','pipe','pipe']});
      const driverExit=once(driver,'exit');
      let output='',errors='';
      driver.stdout.on('data',chunk=>output+=chunk);driver.stderr.on('data',chunk=>errors+=chunk);
      try {
        const bridge=await check(()=>Number(output.trim()),'bridge pid '+errors);
        const tasks={};
        for(const name of ['preload-child','ordinary','fork','shell','bg']){
          tasks[name]=await check(()=>pidFile(path.join(dir,name)),name+' '+errors);
        }
        const foreground=await check(()=>{
          const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8'}).trim().split('\n');
          for(const row of rows){
            const [pid,ppid,group,comm]=row.trim().split(/\s+/);
            if(Number(ppid)===tasks.shell && Number(pid)!==tasks.bg && comm.endsWith('sleep') && Number(group)!==tasks.shell)return Number(pid);
          }
        },'foreground PTY job in its own process group');
        if(end==='host SIGKILL')driver.kill('SIGKILL');
        else if(end==='bridge SIGKILL')process.kill(bridge,'SIGKILL');
        else driver.stdin.end();
        await driverExit;
        const owned=[bridge,...Object.values(tasks),foreground];
        await check(()=>owned.every(pid=>!alive(pid)),'shutdown of '+JSON.stringify(owned)+' '+errors);
        assert.ok(alive(sentinel.pid),'unrelated same-UID sentinel must stay alive');
        assert.equal(errors,'');
      } finally {
        driver.kill('SIGKILL');sentinel.kill();await rm(dir,{recursive:true,force:true});
      }
    });
  }
});
