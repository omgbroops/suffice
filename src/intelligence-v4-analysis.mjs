/** Preserve repetition-level discordance even when opposite outcomes cancel. */
export function pairedTaskDifferences(rows,tasks,left,right){
  return tasks.map(task=>{
    const pairs=[0,1].map(repetition=>{
      const observation=arm=>{
        const matches=rows.filter(row=>row.task===task.id&&row.arm===arm&&row.repetition===repetition);
        if(matches.length!==1||typeof matches[0].accepted!=='boolean'||!matches[0].scorable)throw new Error('Paired analysis requires one scorable boolean outcome per cell');
        return matches[0];
      };
      const l=observation(left),r=observation(right);
      return {repetition,leftAccepted:l.accepted,rightAccepted:r.accepted,difference:Number(l.accepted)-Number(r.accepted),leftPhase:l.resourcePolicyPhase,rightPhase:r.resourcePolicyPhase};
    });
    return {task:task.id,delta:pairs.reduce((sum,pair)=>sum+pair.difference,0)/2,pairs,discordantRepetitions:pairs.filter(pair=>pair.difference!==0).length};
  });
}
