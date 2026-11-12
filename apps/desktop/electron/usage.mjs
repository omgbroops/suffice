import {calculateContextTokens} from '@earendil-works/pi-coding-agent';

const number=value=>Number.isFinite(value)?value:null;
export function sessionUsage(session){
  const stats=session?.getSessionStats?.();
  if(!stats)return null;
  const context=stats.contextUsage??session.getContextUsage?.();
  return {cost:number(stats.cost),totalTokens:number(stats.tokens?.total),windowTokens:number(context?.tokens),windowPercent:number(context?.percent)};
}

// Saved sessions can be inspected without starting an agent or making a request.
export function savedUsage(entries,model){
  let cost=0,totalTokens=0,hasUsage=false,lastAssistant=null,compacted=false;
  for(const entry of entries){
    if(entry.type==='compaction'){compacted=true;lastAssistant=null;}
    const message=entry.type==='message'?entry.message:null;
    const usage=message?.usage??(['usage','compaction','branch_summary'].includes(entry.type)?entry.usage:null);
    if(usage){
      hasUsage=true;
      totalTokens+=['input','output','cacheRead','cacheWrite'].reduce((sum,key)=>sum+(number(usage[key])??0),0);
      cost+=number(usage.cost?.total)??0;
    }
    if(message?.role==='assistant'&&message.usage&&!['error','aborted'].includes(message.stopReason)){lastAssistant=message;compacted=false;}
  }
  const tokens=lastAssistant&&!compacted?number(calculateContextTokens(lastAssistant.usage)):null;
  return {cost:hasUsage?cost:null,totalTokens:hasUsage?totalTokens:null,windowTokens:tokens,windowPercent:tokens!==null&&model?.contextWindow>0?tokens/model.contextWindow*100:null};
}
