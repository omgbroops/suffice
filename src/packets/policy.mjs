import {isAbsolute,posix} from 'node:path';

export const POLICY={version:'packets-v1',sol:'gpt-6.1-sol',solEffort:'low',luna:'gpt-6-luna',lunaEffort:'high',maxPackets:2};
export function complexity(task) {
  const categories={
    async:/\b(async|asynchronous|concurren\w*|race|stream\w*|pool|promise|event|queue)\b/i,
    compatibility:/\b(default|compatib\w*|metadata|recursive|reference|pointer|schema|inherit\w*)\b/i,
    failure:/\b(error|throw\w*|reject\w*|abort\w*|cancel\w*|timeout|hang\w*|crash\w*)\b/i,
    broad:/\b(multi.package|integration|cross.module|across modules)\b/i,
  };
  const reasons=Object.entries(categories).filter(([,r])=>r.test(task)).map(([k])=>k);
  if(task.split(/\s+/).length>220) reasons.push('long_specification');
  return {score:reasons.length,complex:reasons.length>=2,reasons};
}
export function initialRoute(mode,task) {
  const c=complexity(task);
  return {mode,complexity:c,model:mode==='baseline'||c.complex?POLICY.sol:POLICY.luna};
}
export function parsePlan(text) {
  const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  const plan=JSON.parse(clean);
  if(!Array.isArray(plan.packets)||plan.packets.length<1||plan.packets.length>POLICY.maxPackets) throw Error('Expected one or two packets');
  const ids=new Set();
  for(const p of plan.packets) {
    if(typeof p.id!=='string'||!/^[a-z0-9-]{1,30}$/.test(p.id)||ids.has(p.id)) throw Error('Invalid packet identifier');
    ids.add(p.id);
    if(typeof p.goal!=='string'||!p.goal.trim()||p.goal.length>2000) throw Error('A bounded packet goal is required');
    if(!Array.isArray(p.files)||p.files.length>8||p.files.some(x=>typeof x!=='string'||!x||isAbsolute(x)||x.includes('\\')||x.includes(':')||posix.normalize(x)==='..'||posix.normalize(x).startsWith('../'))) throw Error('Unsafe packet paths');
  }
  if(!Array.isArray(plan.invariants)||plan.invariants.some(x=>typeof x!=='string')||JSON.stringify(plan).length>10000) throw Error('Invalid invariant list or oversized plan');
  return plan;
}
