#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {runBenchmarkTask} from '../src/benchmark.mjs';

function parse(args) {
  const options={mode:'core',workspace:'/app',home:'/tmp/suffice-home',strongModel:'gpt-6.2-sol',cheapModel:'gpt-6-luna',effort:'xhigh',cheapEffort:'low',result:'/logs/agent/suffice-result.json'};
  const values={'--mode':'mode','--cwd':'workspace','--home':'home','--model':'strongModel','--cheap-model':'cheapModel','--effort':'effort','--cheap-effort':'cheapEffort','--result':'result','--prompt-file':'promptFile'};
  for(let i=0;i<args.length;i++) {
    const key=values[args[i]];
    if(!key) throw new Error(`Unknown argument: ${args[i]}`);
    if(!args[i+1]) throw new Error(`Missing value for ${args[i]}`);
    options[key]=args[++i];
  }
  if(!['core','auto'].includes(options.mode)) throw new Error('--mode must be core or auto');
  if(!options.promptFile) throw new Error('--prompt-file is required');
  return options;
}

const options=parse(process.argv.slice(2));
const prompt=await readFile(options.promptFile,'utf8');
const report=await runBenchmarkTask({
  mode:options.mode,workspace:options.workspace,home:options.home,prompt,
  strongModelId:options.strongModel,cheapModelId:options.cheapModel,
  effort:options.effort,cheapEffort:options.cheapEffort,resultPath:options.result,
});
if(report.final) console.log(report.final);
if(report.status==='error') {
  const failed=report.attempts?.find(attempt=>attempt.status==='error');
  console.error(`Benchmark agent error: ${failed?.error??'unknown provider or harness failure'}`);
  process.exitCode=1;
}
