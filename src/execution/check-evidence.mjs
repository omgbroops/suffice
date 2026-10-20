// Only explicit infrastructure prerequisites can suppress a candidate repair.
// Required product state belongs in the actual check, never in prerequisites.
export function validatePrerequisites(check) {
  if(check.prerequisites===undefined)return;
  if(!Array.isArray(check.prerequisites)||check.prerequisites.length>4)throw Error('At most four infrastructure prerequisites per check');
  for(const p of check.prerequisites) {
    if(p.purpose!=='infrastructure'||!Array.isArray(p.command)||!p.command.length||p.command.some(a=>typeof a!=='string'||!a.length||a.includes('\0'))||
      (p.timeoutMs!==undefined&&(!Number.isFinite(p.timeoutMs)||p.timeoutMs<=0||p.timeoutMs>10000)))throw Error('Prerequisites require explicit infrastructure purpose, argv and a bounded timeout');
  }
}

export function checkEvidence(outcome) {
  const unavailable=outcome.status==='unavailable';
  const passed=!unavailable&&outcome.passed===true&&Number.isInteger(outcome.exitCode)&&outcome.exitCode===(outcome.expectedExitCode??0)&&!outcome.error;
  return {...outcome,passed,status:unavailable?'unavailable':passed?'passed':'failed'};
}

export function verificationState(outcomes) {
  if(!outcomes.length)return 'not_configured';
  if(outcomes.some(o=>checkEvidence(o).status==='failed'))return 'failed';
  return outcomes.some(o=>o.status==='unavailable')?'unavailable':'passed';
}
