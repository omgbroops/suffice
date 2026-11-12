import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {realpathSync} from 'node:fs';import {filesIn} from './workspace.mjs';import {root} from './runtime.mjs';
export async function runUpstream(workspace,{signal}={}){
  const paths=(await filesIn(resolve(workspace,'src/test/core'))).filter(p=>p.endsWith('.test.mjs')&&!['dist.test.mjs','dump-fuzzy.test.mjs','pathological.test.mjs'].includes(p)).map(p=>'src/test/core/'+p);
  const loader=resolve(root,'benchmarks/workflow/upstream-loader.mjs'),start=Date.now();
  return new Promise(done=>{
    const realWorkspace=realpathSync(workspace),realLoader=realpathSync(loader);
    const child=spawn(process.execPath,['--permission',`--allow-fs-read=${realWorkspace}`,`--allow-fs-read=${realLoader}`,'--max-old-space-size=128','--import',pathToFileURL(realLoader).href,'--test','--test-isolation=none','--test-reporter=tap',...paths],{cwd:workspace,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'',WINDIR:process.env.WINDIR??'',SUFFICE_WORKSPACE:realWorkspace,NODE_NO_WARNINGS:'1'},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',truncated=false,timedOut=false;child.stdout.on('data',b=>{stdout+=b;if(stdout.length>1024**2){truncated=true;stdout=stdout.slice(0,1024**2);}});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>30000){truncated=true;stderr=stderr.slice(0,30000);}});
    const stop=()=>{timedOut=true;child.kill();},timer=setTimeout(stop,30000);signal?.addEventListener('abort',stop,{once:true});
    child.on('error',e=>{clearTimeout(timer);done({status:'infrastructure_error',errorCode:e.code,stdout,stderr});});
    child.on('close',exitCode=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);const count=k=>{const matches=[...stdout.matchAll(new RegExp(`^# ${k} (\\d+)$`,'gm'))];return matches.length===1?Number(matches[0][1]):null;};const tests=count('tests'),passed=count('pass'),failed=count('fail'),skipped=count('skipped'),cancelled=count('cancelled'),todo=count('todo');
      const valid=tests>=100&&passed===tests&&failed===0&&skipped===0&&cancelled===0&&todo===0;
      done({status:timedOut?'timeout':exitCode===0&&!truncated&&valid?'passed':exitCode===0?'invalid_result':'failed',exitCode,tests,passed,failed,skipped,cancelled,todo,truncated,files:paths.length,stdout,stderr,latencyMs:Date.now()-start});});
  });
}
