// Rule-based cheaper-setting hint. Evidence (research/token-model.json, 2026-11-18, small n):
// low effort on Sol passed 6/6 at about the same cost, so effort is suggested first;
// a lighter model passed only 2/6 on the control cohort, so it is suggested only for trivial asks.
const complex=/\b(refactor|architect\w*|migrat\w*|redesign|rewrite|implement\w*|build|debug\w*|race condition|concurren\w*|security|vulnerab\w*|across|entire|every file|all files|performance|optimi[sz]e|design)\b/i;
const simple=/\b(typo|spelling|rename|explain|what (is|does|are)|why (is|does)|where (is|are)|show me|list|format|lint|comment|docstring|bump|readme|summari[sz]e)\b/i;
const trivial=/\b(typo|spelling|rename|explain|what (is|does|are)|where (is|are)|show me|list|bump)\b/i;
const light=/\b(mini|haiku|luna|flash|lite|nano)\b/i;
const rank=['off','minimal','low','medium','high','xhigh','max'];

export function taskLooks(text){
 const value=String(text||'').trim();
 if(value.length<8||value.length>240||value.split('\n').length>4||value.includes('```')||complex.test(value))return 'unknown';
 return trivial.test(value)&&value.length<=120?'trivial':simple.test(value)?'simple':'unknown';
}

// state: {text, model:{id,provider,efforts}|null, effort, models:[{id,provider,name,available,efforts}]}
export function suggest({text,model,effort,models=[]}){
 if(!model||model.provider==='cli'||!model.efforts?.length)return null;
 const task=taskLooks(text);if(task==='unknown')return null;
 if(model.efforts.includes('low')&&rank.indexOf(effort)>rank.indexOf('low'))return {kind:'effort',effort:'low',message:'Looks like a simple task. Low effort is usually enough.',action:'Use Low'};
 if(task==='trivial'&&!light.test(`${model.id} ${model.name||''}`)){
  const cheaper=models.find(m=>m.available!==false&&m.provider===model.provider&&m.id!==model.id&&light.test(`${m.id} ${m.name||''}`));
  if(cheaper)return {kind:'model',model:cheaper.id,provider:cheaper.provider,message:`Small ask. ${cheaper.name||cheaper.id} costs less. Switch back if it struggles.`,action:`Use ${cheaper.name||cheaper.id}`};
 }
 return null;
}
