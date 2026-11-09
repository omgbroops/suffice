import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CONFIGURATIONS,scheduleV4,v4CellId,reserveV4Round,requestCostReserve} from '../src/eval-v4/design.mjs';
import {normalizeReport,gradeReport,inventory,canonicalLabel} from '../src/eval-v4/grading.mjs';
import {sandboxArguments} from '../src/eval-v4/sandbox.mjs';

test('v4 schedules 192 distinct cells with equal model counts and balanced order',async()=>{
  const cohort=JSON.parse(await readFile(new URL('../benchmarks/intelligence-v4/cohort.json',import.meta.url),'utf8')),rounds=scheduleV4(cohort.tasks);
  assert.equal(rounds.length,48);assert.equal(new Set(rounds.flat().map(v4CellId)).size,192);
  for(const round of rounds){assert.equal(new Set(round.map(item=>item.arm)).size,4);assert.equal(new Set(round.map(item=>item.task)).size,1);assert.equal(new Set(round.map(item=>item.repetition)).size,1);}
  for(const arm of ['A','B','C','D'])for(let position=0;position<4;position++)assert.equal(rounds.filter(round=>round[position].arm===arm).length,12);
  assert.deepEqual(CONFIGURATIONS.map(c=>[c.model,c.effort,c.mode]),[['gpt-6-luna','xhigh','off'],['gpt-6-luna','xhigh','guided'],['gpt-6-luna','xhigh','on-demand'],['gpt-6.1-sol','medium','off']]);
  assert.deepEqual(scheduleV4(cohort.tasks),rounds);
});
test('v4 reserves complete four-condition rounds without forgetting earlier unknown costs',async()=>{
  const tasks=JSON.parse(await readFile(new URL('../benchmarks/intelligence-v4/cohort.json',import.meta.url),'utf8')).tasks,round=scheduleV4(tasks)[0],ledger={cap:6,entries:[{runId:'old-unknown',known:0,reserved:1,unknown:true}]};
  const previous=JSON.stringify(ledger);assert.equal(reserveV4Round(ledger,round),false);assert.equal(JSON.stringify(ledger),previous);
  ledger.cap=25;assert.equal(reserveV4Round(ledger,round),true);assert.equal(ledger.entries.length,5);assert.equal(ledger.entries[0].reserved,1);assert.equal(ledger.entries[0].unknown,true);assert.throws(()=>reserveV4Round(ledger,round));assert.throws(()=>reserveV4Round(ledger,round.slice(0,3)));
  assert.equal(requestCostReserve({cost:{input:2,output:10,tiers:[{input:4,output:15}]}},{max_output_tokens:1000},10000),0.055);
});
test('verification never accepts a missing, skipped, duplicated-failing or unreported required test',()=>{
  const raw={stats:{tests:3,passes:2,failures:1,pending:0},tests:[{title:'target',status:'passed'},{title:'regression',status:'passed'},{title:'target',status:'failed'}]},report=normalizeReport(raw,{framework:'mocha'});
  assert.equal(report.validInventory,true);assert.equal(gradeReport(report,{targets:['target'],regressions:['regression']}).accepted,false);
  assert.equal(gradeReport({...report,tests:report.tests.slice(1)},{targets:['absent'],regressions:['regression']}).valid,false);
  const passing=normalizeReport({stats:{tests:2,passes:2,failures:0,pending:0},tests:[{title:'target',status:'passed'},{title:'regression',status:'passed'}]},{framework:'mocha'}),options={targets:['target'],regressions:['regression'],expectedInventory:inventory(passing)};
  assert.equal(gradeReport(passing,options).accepted,true);
  assert.equal(gradeReport({...passing,tests:[{title:'target',status:'pending'},{title:'regression',status:'passed'}]},options).accepted,false);
  assert.equal(gradeReport({...passing,validInventory:false},options).accepted,false);
});
test('Jest and QUnit labels retain semantic identities instead of Linux roots or TAP ordinals',()=>{
  const report=normalizeReport({numTotalTests:1,numPassedTests:1,numFailedTests:0,numPendingTests:0,testResults:[{name:'C:/v4-case/tests/example.js',assertionResults:[{fullName:'format',status:'passed'}]}]},{framework:'jest',workspace:'C:/v4-case'});
  assert.equal(gradeReport(report,{targets:['/testbed/tests/example.js->format'],regressions:[]}).accepted,true);
  assert.equal(canonicalLabel('988 Source > Maths > Box3 > intersectsPlane','qunit'),'Source > Maths > Box3 > intersectsPlane');
});

test('duplicate upstream QUnit todo titles cannot hide a newly skipped regression',()=>{
  // QUnit disambiguates a duplicate name by appending a space; TAP labels strip it.
  const report=normalizeReport({stats:{total:2,passed:1,failed:0,todo:1,skipped:0},tests:[{title:'same ',status:'passed'},{title:'same',status:'todo'}]},{framework:'qunit'}),tests=report.tests;
  const options={targets:[],regressions:['same'],knownPending:['same'],expectedInventory:inventory(report)};
  assert.equal(gradeReport(report,options).accepted,true);
  assert.equal(gradeReport({...report,tests:tests.map(t=>({...t,status:'todo'}))},options).accepted,false);
  assert.equal(gradeReport({...report,tests:[{title:'same',status:'failed'},tests[1]]},options).accepted,false);
});

test('candidate error text is not enough to relabel engineering failure as infrastructure',()=>{
  assert.equal(gradeReport({framework:'mocha',executionFailure:{stderr:'EPERM in candidate'}},{targets:[],regressions:[]}).valid,true);
  assert.equal(gradeReport({framework:'mocha',executionFailure:{launchErrorCode:'EPERM'}},{targets:[],regressions:[]}).valid,false);
});

test('Mocha hook failures have valid receipts but never pass independent grading',()=>{
  const report=normalizeReport({stats:{tests:1,passes:1,failures:1,pending:0},tests:[{title:'regression',status:'passed'}],hooks:[{title:'before hook',status:'failed'}]},{framework:'mocha'});
  assert.equal(report.validInventory,true);
  assert.equal(gradeReport(report,{targets:[],regressions:['regression']}).accepted,false);
});
test('sandbox policy denies host home and sibling attempts, keeps dependencies read-only, and selects explicit PowerShell',()=>{
  const args=sandboxArguments({workspace:'C:/Users/Public/SufficeV4/run/workspace',readableRoots:['C:/Users/Public/SufficeV4/deps-abc/node_modules'],deniedRoots:['C:/Users/Public/SufficeV4/other-run'],command:'node native-verify.cjs',shellExecutable:'C:/runtime/pwsh.exe'});
  assert.ok(args.includes('windows.sandbox="mxc"'));assert.ok(args.includes('permissions.suffice-v4.network.enabled=false'));
  const filesystem=args.find(arg=>arg.startsWith('permissions.suffice-v4.filesystem='));assert.match(filesystem,/other-run"="deny"/);assert.match(filesystem,/node_modules"="read"/);assert.ok(args.includes('C:/runtime/pwsh.exe'));assert.match(args.at(-1),/Set-Location -LiteralPath/);assert.match(args.at(-1),/\$env:TEMP=/);
});
