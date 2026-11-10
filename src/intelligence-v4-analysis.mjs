/** Preserve repetition-level discordance even when opposite outcomes cancel. */
export function classifyAnalysisOutcome(result){
  // The frozen worker's provider detector missed this SDK stream termination.
  // Preserve the raw label; apply the protocol's provider-failure exclusion.
  if(result?.classification==='agent_error'&&result.error==='OpenAI Responses stream ended before a terminal response event')return 'provider_interruption';
  return result?.classification??'missing';
}

export function pairedTaskDifferences(rows,tasks,left,right,repetitions=[0,1]){
  if(!repetitions.length||new Set(repetitions).size!==repetitions.length||repetitions.some(rep=>!Number.isInteger(rep)||rep<0))throw new Error('Distinct nonnegative repetitions required');
  return tasks.map(task=>{
    const pairs=repetitions.map(repetition=>{
      const observation=arm=>{
        const matches=rows.filter(row=>row.task===task.id&&row.arm===arm&&row.repetition===repetition);
        if(matches.length!==1||typeof matches[0].accepted!=='boolean'||!matches[0].scorable)throw new Error('Paired analysis requires one scorable boolean outcome per cell');
        return matches[0];
      };
      const l=observation(left),r=observation(right);
      return {repetition,leftAccepted:l.accepted,rightAccepted:r.accepted,difference:Number(l.accepted)-Number(r.accepted),leftPhase:l.resourcePolicyPhase,rightPhase:r.resourcePolicyPhase};
    });
    return {task:task.id,delta:pairs.reduce((sum,pair)=>sum+pair.difference,0)/pairs.length,pairs,discordantRepetitions:pairs.filter(pair=>pair.difference!==0).length};
  });
}
