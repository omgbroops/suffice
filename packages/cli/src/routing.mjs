// Selection rule copied from the frozen suffice-v2 packets-v1 experiment.
// No model calls, repository scans, prompt rewriting or worker sessions.
export const ROUTING_POLICY = Object.freeze({
  version:'routing-v1', sol:'gpt-6.1-sol', solEffort:'low',
  luna:'gpt-6-luna', lunaEffort:'high',
});

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

export function selectRoute(text,{complexContext=false,images=false}={}) {
  const c=complexity(text),sol=c.complex||complexContext||images;
  return {policy:ROUTING_POLICY.version,model:sol?ROUTING_POLICY.sol:ROUTING_POLICY.luna,
    effort:sol?ROUTING_POLICY.solEffort:ROUTING_POLICY.lunaEffort,
    complexity:c,complexContext,images};
}

