export const STRATEGIES=Object.freeze(['luna','sol','ladder','v11']);
export const MODELS=Object.freeze({worker:'gpt-6-luna',expert:'gpt-6.1-sol'});
export const EFFORTS=Object.freeze({worker:'high',advisor:'low',expert:'high'});
export const VERSION='v11.0-candidate';
const text=x=>typeof x==='string'&&x.trim().length>0&&!x.includes('\0');
export function validateCommand(command) {
  if(!Array.isArray(command)||!command.length||command.length>40||command.some(x=>!text(x)))throw Error('Checks need a bounded argv command');
  return [...command];
}
export function normalizeRequest(input) {
  const allowed=['workspace','prompt','runDir','strategy','maxCostUsd','timeoutMs','checks','models','efforts','maxRepairs','protectedPaths','contextPaths','generatedTests','compactResponses'];
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Unknown v11 request field; graders and hidden verdicts are not controller inputs');
  const r={strategy:'v11',maxCostUsd:.5,timeoutMs:600_000,maxRepairs:1,checks:[],protectedPaths:[],contextPaths:[],generatedTests:true,compactResponses:false,...input};
  for(const key of ['workspace','prompt','runDir'])if(!text(r[key]))throw Error(`${key} is required`);
  if(r.prompt.length>80_000||!STRATEGIES.includes(r.strategy))throw Error('Invalid task or strategy');
  for(const key of ['maxCostUsd','timeoutMs'])if(!Number.isFinite(r[key])||r[key]<=0)throw Error(`Invalid ${key}`);
  if(!Number.isInteger(r.maxRepairs)||r.maxRepairs<0||r.maxRepairs>2)throw Error('maxRepairs must be 0, 1 or 2');
  if(typeof r.compactResponses!=='boolean')throw Error('compactResponses must be boolean');
  if(typeof r.generatedTests!=='boolean')throw Error('generatedTests must be boolean');
  r.models={...MODELS,...r.models};r.efforts={...EFFORTS,...r.efforts};
  if(Object.keys(r.models).some(k=>!Object.hasOwn(MODELS,k))||Object.entries(r.models).some(([k,v])=>v!==MODELS[k]))throw Error('This experiment pins Luna and Sol; change the version to study other models');
  if(Object.keys(r.efforts).some(k=>!Object.hasOwn(EFFORTS,k))||Object.values(r.efforts).some(x=>!['low','medium','high','xhigh','max'].includes(x)))throw Error('Invalid reasoning effort');
  const ids=new Set();
  if(!Array.isArray(r.checks)||r.checks.length>16)throw Error('Expected at most 16 public checks');
  r.checks=r.checks.map((c,i)=>{
    if(!c||Object.keys(c).some(k=>!['id','command','timeoutMs','testsRequired'].includes(k)))throw Error('Unknown public check field');
    const id=c.id??`public-${i+1}`;
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(id)||ids.has(id))throw Error('Check ids must be unique');ids.add(id);
    if(c.timeoutMs!==undefined&&(!Number.isFinite(c.timeoutMs)||c.timeoutMs<=0))throw Error('Invalid check timeout');
    if(c.testsRequired!==undefined&&typeof c.testsRequired!=='boolean')throw Error('Invalid testsRequired');
    return {...c,id,command:validateCommand(c.command)};
  });
  for(const key of ['protectedPaths','contextPaths'])if(!Array.isArray(r[key])||r[key].length>100||r[key].some(x=>!text(x)))throw Error(`Invalid ${key}`);
  return r;
}
