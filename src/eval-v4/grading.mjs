import {relative} from 'node:path';

export function canonicalLabel(label,framework){
  if(framework==='qunit')return label.replace(/^\d+\s+/,'').trimEnd();
  if(framework==='jest')return label.replaceAll('\\','/').replace(/^\/testbed\//,'');
  return label;
}
export function normalizeReport(raw,{framework,workspace}){
  if(raw.executionFailure)return {framework,tests:[],executionFailure:raw.executionFailure,validInventory:false};
  if(framework==='jest'){
    const tests=(raw.testResults??[]).flatMap(suite=>(suite.assertionResults??[]).map(test=>({title:relative(workspace,suite.name).replaceAll('\\','/')+'->'+test.fullName,status:test.status,durationMs:test.duration??0,error:test.failureMessages})));
    const loadErrors=(raw.testResults??[]).filter(suite=>!suite.assertionResults?.length&&suite.status==='failed').map(suite=>suite.message??suite.failureMessage);
    return {framework,tests,loadErrors,validInventory:raw.numTotalTests===tests.length&&raw.numPassedTests===tests.filter(test=>test.status==='passed').length&&raw.numFailedTests===tests.filter(test=>test.status==='failed').length&&raw.numPendingTests===tests.filter(test=>['pending','skipped','disabled'].includes(test.status)).length&&(raw.numTodoTests??0)===tests.filter(test=>test.status==='todo').length};
  }
  const tests=(raw.tests??[]).map(test=>({...test,title:canonicalLabel(test.title,framework)})),stats=raw.stats??{};
  const passed=tests.filter(test=>test.status==='passed').length,failed=tests.filter(test=>test.status==='failed').length,pending=tests.filter(test=>['pending','todo','skipped'].includes(test.status)).length;
  const validInventory=framework==='mocha'?stats.tests===tests.length&&stats.passes===passed&&stats.failures===failed+(raw.hooks??[]).filter(hook=>hook.status==='failed').length&&stats.pending===pending:
    stats.total===tests.length&&stats.passed===passed&&stats.failed===failed&&(stats.skipped??0)+(stats.todo??0)===pending;
  return {framework,tests,hooks:raw.hooks??[],loadErrors:raw.loadError?[raw.loadError]:[],validInventory};
}
export const inventory=report=>Object.fromEntries([...new Set(report.tests.map(test=>test.title))].sort().map(title=>[title,report.tests.filter(test=>test.title===title).length]));
export function gradeReport(report,{targets,regressions,expectedInventory,knownPending=[]}){
  const required=[...targets,...regressions].map(label=>canonicalLabel(label,report.framework));
  if(report.executionFailure){const text=JSON.stringify(report.executionFailure),environmentError=['ENOENT','EACCES','EPERM','ENOMEM'].includes(report.executionFailure.launchErrorCode),classification=environmentError?'execution_environment_error':/heap out of memory|allocation failed/i.test(text)?'candidate_memory_limit':/timed out|ETIMEDOUT/i.test(text)?'candidate_verification_timeout':'candidate_build_or_execution_failure';return {valid:!environmentError,accepted:false,classification,executionFailure:report.executionFailure,targetsPassed:null,regressionsPassed:null};}
  if(report.loadErrors?.length||report.hooks?.length)return {valid:true,accepted:false,classification:'candidate_load_or_hook_failure',loadErrors:report.loadErrors,hooks:report.hooks,targetsPassed:0,regressionsPassed:0};
  const count=inventory(report),matches=report.validInventory&&(!expectedInventory||JSON.stringify(count)===JSON.stringify(expectedInventory));
  const isPending=test=>['pending','todo','skipped','disabled'].includes(test.status);
  const pendingAllowance=Object.fromEntries([...new Set(knownPending)].map(title=>[title,knownPending.filter(x=>x===title).length]));
  const has=label=>report.tests.some(test=>test.title===label),passes=label=>{
    const matches=report.tests.filter(test=>test.title===label),active=matches.filter(test=>!isPending(test));
    return active.length>0&&active.every(test=>test.status==='passed')&&matches.filter(isPending).length<=(pendingAllowance[label]??0);
  };
  const missing=required.filter(label=>!has(label)),targetNames=targets.map(label=>canonicalLabel(label,report.framework)),regressionNames=regressions.map(label=>canonicalLabel(label,report.framework));
  const pending=report.tests.filter(isPending).map(test=>test.title);
  const unexpectedPending=[...new Set(pending)].filter(title=>pending.filter(x=>x===title).length>(pendingAllowance[title]??0));
  const failures=report.tests.filter(test=>test.status==='failed').map(test=>test.title);
  return {valid:matches&&!missing.length,accepted:matches&&!missing.length&&!failures.length&&!unexpectedPending.length&&required.every(passes),classification:!matches||missing.length?'evaluator_inventory_error':failures.length||unexpectedPending.length?'failed_tests':'passed',targets:targets.length,targetsPassed:targetNames.filter(passes).length,regressions:regressions.length,regressionsPassed:regressionNames.filter(passes).length,missing,failures,unexpectedPending,inventory:count};
}
