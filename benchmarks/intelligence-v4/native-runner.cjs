// Public verification helper: its defaults come only from the original checkout.
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=process.cwd(),config=JSON.parse(fs.readFileSync('verification.json','utf8')),args=process.argv.slice(2);
const value=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const report=path.resolve(value('--report')||'.v4-tmp/public-report.json');fs.mkdirSync(path.dirname(report),{recursive:true});
const selected=value('--tests-json'),tests=selected?JSON.parse(fs.readFileSync(selected,'utf8')):config.publicTests;
const env={...process.env,CI:'true',TZ:'UTC',NODE_ENV:'test',NODE_OPTIONS:'--max-old-space-size=384',SUFFICE_EVAL_REPORT:report};
const execute=(argv,timeout=240000)=>spawnSync(config.nodeRuntime,['--max-old-space-size=384',...argv],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:16*1024**2});
for(const build of config.buildSteps){
  const result=execute(build,120000);if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
  if(result.status!==0){fs.writeFileSync(report,JSON.stringify({framework:config.framework,executionFailure:{stage:'build',code:result.status,signal:result.signal,error:result.error?.message,launchErrorCode:result.error?.code,stdout:result.stdout,stderr:result.stderr}}));process.exit(result.status||1);}
}
let invocation;
if(config.framework==='mocha')invocation=['node_modules/mocha/bin/_mocha',...(config.mochaRequires??[]).flatMap(name=>['--require',name]),...tests,'--reporter',path.resolve('.v4-mocha-reporter.cjs'),'--timeout','15000','--exit'];
else if(config.framework==='jest')invocation=['node_modules/jest/bin/jest.js','--runInBand','--watchman=false','--json','--outputFile',report,'--no-cache','--runTestsByPath',...tests];
else if(config.framework==='qunit')invocation=['.v4-qunit-runner.cjs',config.qunitEntry];
else throw new Error('Unknown verified framework');
const result=execute(invocation);if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
if(!fs.existsSync(report))fs.writeFileSync(report,JSON.stringify({framework:config.framework,executionFailure:{stage:'test',code:result.status,signal:result.signal,error:result.error?.message,launchErrorCode:result.error?.code,stdout:result.stdout,stderr:result.stderr}}));
if(result.error)process.stderr.write('\n'+result.error.message+'\n');
console.log('\nVerification report: '+path.relative(root,report));process.exit(result.status??1);
