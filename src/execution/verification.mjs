// An explicit public contract plan, not hidden acceptance or an LLM correctness score.
import {checkEvidence,validatePrerequisites,verificationState} from './check-evidence.mjs';
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
export function validateContractPlan(plan) {
  if (plan===undefined) return undefined;
  if (!plan || !Array.isArray(plan.requirements) || !plan.requirements.length || plan.requirements.length>20 ||
      !Array.isArray(plan.checks) || !plan.checks.length || plan.checks.length>12) throw Error('Contract verification needs bounded requirements and checks');
  const ids=new Set();
  for (const r of plan.requirements) {
    if (!nonempty(r.id)||ids.has(r.id)||!nonempty(r.statement)||r.statement.length>3000 ||
        !['issue','documentation','user'].includes(r.source?.kind)||!nonempty(r.source.reference)||!nonempty(r.source.excerpt))
      throw Error('Each contract needs a unique id and explicit public source evidence');
    ids.add(r.id);
  }
  const checks=new Set(),covered=new Set();
  for (const c of plan.checks) {
    validatePrerequisites(c);
    if (!nonempty(c.id)||checks.has(c.id)||!Array.isArray(c.command)||!c.command.length||
        c.command.some(a=>typeof a!=='string'||a.includes('\0'))||
        !Array.isArray(c.covers)||!c.covers.length||c.covers.some(id=>!ids.has(id))||
        (c.expectedExitCode!==undefined&&c.expectedExitCode!==0)||
        (c.timeoutMs!==undefined&&(!Number.isFinite(c.timeoutMs)||c.timeoutMs<=0||c.timeoutMs>60000)))
      throw Error('Contract checks require unique ids, argv, known coverage and success exit zero');
    checks.add(c.id);c.covers.forEach(id=>covered.add(id));
  }
  if ([...ids].some(id=>!covered.has(id))) throw Error('Every public requirement needs an executable check before inference');
  if (plan.maxCheckMs!==undefined&&(!Number.isFinite(plan.maxCheckMs)||plan.maxCheckMs<=0||plan.maxCheckMs>120000)) throw Error('Invalid contract verification allowance');
  return structuredClone(plan);
}

export async function verifyPublicContracts({plan,workspace,runCheck,deadline=Infinity,now=Date.now}) {
  if (!plan) return {status:'not_configured',outcomes:[],coverage:[]};
  const started=now(),end=Math.min(deadline,started+(plan.maxCheckMs??20000)),outcomes=[];
  for (const c of plan.checks) {
    if (now()>=end) {outcomes.push({id:c.id,kind:'contract',command:c.command,passed:false,exitCode:null,covers:c.covers,error:'Contract verification time allowance exhausted',output:''});continue;}
    const begin=now();
    let result;
    try {result=await runCheck({workspace,check:{...c,expectedExitCode:0},timeoutMs:Math.min(c.timeoutMs??10000,end-now())});}
    catch(error) {result={passed:false,exitCode:null,error:error.message,output:''};}
    // A friendly "passed" string or asserted boolean cannot override a missing/nonzero status.
    outcomes.push(checkEvidence({...result,id:c.id,kind:'contract',command:c.command,covers:c.covers,
      expectedExitCode:0,latencyMs:now()-begin}));
  }
  const coverage=plan.requirements.map(r=>({id:r.id,statement:r.statement,source:r.source,
    checkIds:outcomes.filter(c=>c.covers.includes(r.id)).map(c=>c.id),
    passed:outcomes.filter(c=>c.covers.includes(r.id)).every(c=>c.passed)}));
  return {status:verificationState(outcomes),outcomes,coverage,latencyMs:now()-started,
    interpretation:'Only these explicit public contracts were checked; independent acceptance remains separate.'};
}
