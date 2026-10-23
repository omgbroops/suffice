import {runProcess} from './process.mjs';
import {validateCommand} from './config.mjs';

export function testCount(text='') {
  const s=String(text);
  const patterns=[/^(?:#|ℹ) tests (\d+)\s*$/gm,/\bRan (\d+) tests?\b/g,/\bTests:.*?\b(\d+) total/g,/\b(\d+) tests? completed\b/g];
  for(const pattern of patterns){const matches=[...s.matchAll(pattern)];if(matches.length)return matches.reduce((n,m)=>n+Number(m[2]??m[1]),0);}
  const rust=[...s.matchAll(/test result:.*? (\d+) passed; (\d+) failed/g)];
  if(rust.length)return rust.reduce((n,m)=>n+Number(m[1])+Number(m[2]),0);
  const pytest=[...s.matchAll(/(?:^|[, =])(\d+) (passed|failed|errors?)(?=[, =]|$)/gm)];
  if(pytest.length)return pytest.reduce((n,m)=>n+Number(m[1]),0);
  const mocha=[...s.matchAll(/\b(\d+) passing\b/g)];if(mocha.length)return Number(mocha.at(-1)[1]);
  const ctest=/tests passed, \d+ tests failed out of (\d+)/.exec(s);if(ctest)return Number(ctest[1]);
  if(/no tests (?:ran|found)|running 0 tests|NO-SOURCE|0 passing/i.test(s))return 0;
  return null;
}
export async function runPublicCheck({workspace,check,timeoutMs,signal}) {
  validateCommand(check.command);
  const [command,...args]=check.command;
  // npm.cmd is not directly spawnable without a shell on Windows. Use Node's installed npm CLI.
  let bin=command,argv=args;
  if(process.platform==='win32'&&['npm','npm.cmd'].includes(command)) {
    const {resolve}=await import('node:path');const {existsSync}=await import('node:fs');
    const npmCli=resolve(process.execPath,'..','node_modules','npm','bin','npm-cli.js');
    if(!existsSync(npmCli))return {id:check.id,status:'unavailable',exitCode:null,output:'Use an explicit node/npm-cli.js argv on this installation',tests:null};
    bin=process.execPath;argv=[npmCli,...args];
  }
  const out=await runProcess(bin,argv,{cwd:workspace,timeoutMs:Math.max(1,Math.min(timeoutMs,check.timeoutMs??60_000)),maxBytes:1_000_000,signal});
  const output=(out.stdout+'\n'+out.stderr).slice(-16_000),tests=testCount(output);
  const executed=[...output.matchAll(/^(?:#|ℹ) (?:pass|fail) (\d+)\s*$/gm)];
  const noneExecuted=executed.length>0&&executed.every(m=>Number(m[1])===0);
  const status=out.error?'unavailable':out.timedOut||out.overflow||out.aborted?'unverified':check.testsRequired&&(tests===0||noneExecuted)?'unverified':out.exitCode!==0?'failed':check.testsRequired&&tests===null?'unverified':'passed';
  return {id:check.id,command:check.command,status,exitCode:out.exitCode,tests,output,error:out.error,latencyMs:out.latencyMs};
}
export function verificationState(outcomes) {
  if(outcomes.some(c=>c.status==='failed'))return 'failed';
  if(!outcomes.length||outcomes.some(c=>c.status!=='passed'))return 'unverified';
  return 'passed';
}
// Public regressions dominate generated assertions. Compare only evaluations of the same suite.
export function checkpointScore(outcomes) {
  const count=(kind,state)=>outcomes.filter(c=>c.kind===kind&&(state==='unknown'?!['passed','failed'].includes(c.status):c.status===state)).length;
  return [count('public','failed'),count('public','unknown'),count('generated','failed'),count('generated','unknown')];
}
export function better(a,b) {for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;}
