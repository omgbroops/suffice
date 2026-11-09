export const CONFIGURATIONS=Object.freeze([
  {id:'A',name:'Luna baseline',model:'gpt-6-luna',effort:'xhigh',mode:'off'},
  {id:'B',name:'Luna always-guided',model:'gpt-6-luna',effort:'xhigh',mode:'guided'},
  {id:'C',name:'Luna on-demand',model:'gpt-6-luna',effort:'xhigh',mode:'on-demand'},
  {id:'D',name:'Sol Medium baseline',model:'gpt-6.1-sol',effort:'medium',mode:'off'}
]);
export const CATEGORIES={'simple':4,'cross-file':12,'complex':8};
export const COMPARISONS=[['B','A'],['C','A'],['C','B'],['C','D']];
export const LIMITS=Object.freeze({timeout:1200,maxTurns:90,maxToolCalls:400,maxOutputTokens:16384,maxProviderPayloadBytes:1048576,maxTaskTokens:4000000,retryCount:0,serviceTier:'default'});
export const COST_CEILINGS=Object.freeze({'gpt-6-luna':0.25,'gpt-6.1-sol':5});
export function requestCostReserve(catalog,payload,bytes){
  const prices=[catalog.cost,...(catalog.cost.tiers??[])],input=Math.max(...prices.map(price=>price.input)),output=Math.max(...prices.map(price=>price.output));
  return (bytes*input+(payload.max_output_tokens??LIMITS.maxOutputTokens)*output)/1000000;
}
export function scheduleV4(tasks,seed=20261110){
  if(tasks.length!==24||new Set(tasks.map(task=>task.id)).size!==24)throw new Error('V4 requires 24 distinct fixed tasks');
  for(const [category,count]of Object.entries(CATEGORIES))if(tasks.filter(task=>task.category===category).length!==count)throw new Error('Incorrect category quota');
  let state=seed>>>0;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32),shuffle=values=>values.map(value=>({value,key:random()})).sort((a,b)=>a.key-b.key).map(x=>x.value);
  const families=shuffle([...new Set(tasks.map(task=>task.repo))]),queues=new Map(families.map(repo=>[repo,shuffle(tasks.filter(task=>task.repo===repo))]));
  const ordered=[];while(ordered.length<tasks.length)for(const repo of families){const task=queues.get(repo).shift();if(task)ordered.push(task);}
  const williams=[['A','B','D','C'],['B','C','A','D'],['C','D','B','A'],['D','A','C','B']],rounds=[];
  for(let i=0;i<ordered.length;i++)for(let repetition=0;repetition<2;repetition++){
    const task=ordered[i],order=williams[rounds.length%4];
    rounds.push(order.map(arm=>({task:task.id,repo:task.repo,category:task.category,repetition,...CONFIGURATIONS.find(c=>c.id===arm),arm})));
  }
  return rounds;
}
export const v4CellId=item=>`${item.task}-${item.arm}-r${item.repetition}`;
export function reserveV4Round(ledger,round,campaign='repository-intelligence-v4'){
  if(new Set(round.map(item=>item.arm)).size!==4)throw new Error('Reserve all four configurations together');
  const entries=round.map(item=>({runId:campaign+'/'+v4CellId(item)+'-a0',reserved:COST_CEILINGS[item.model],known:0,unknown:true,state:'reserved'}));
  const retained=ledger.entries.filter(old=>!entries.some(entry=>entry.runId===old.runId));
  for(const entry of entries){const old=ledger.entries.find(old=>old.runId===entry.runId);if(old&&!(old.state==='not_started'&&old.reserved===0&&!old.unknown))throw new Error('Existing attempt requires audit');}
  if([...retained,...entries].reduce((sum,entry)=>sum+entry.reserved,0)>ledger.cap)return false;
  ledger.entries=[...retained,...entries];return true;
}
