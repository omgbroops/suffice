"""Derive new adapters from completed campaign adapters, leaving parents intact."""
import pathlib,json,datetime,shutil
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def replace(s,a,b):
 if a not in s:raise RuntimeError('Expected adapter source absent: '+a[:100])
 return s.replace(a,b)
s=(ROOT/'experiments/luna-evidence-v1/execution.mjs').read_text(encoding='utf8')
s=replace(s,"export const EFFORT=process.env.SUFFICE_EVIDENCE_EFFORT??'low';\nif(!['low','medium'].includes(EFFORT))throw Error('Unregistered effort');", "export const ARM=process.env.SUFFICE_SAFEGUARDS_ARM??'A';\nif(!['A','B','C'].includes(ARM))throw Error('Unregistered arm');\nexport const EFFORT=ARM==='C'?'xhigh':'low';")
s=replace(s,"'/home/eric_qin/suffice-luna-evidence-v1-'+EFFORT","'/home/eric_qin/suffice-luna-safeguards-v1-'+ARM")
s=s.replace('experiments/luna-evidence-v1/variants/${EFFORT}','experiments/luna-safeguards-v1/variants/${ARM}')
(HERE/'execution.mjs').write_text(s,encoding='utf8')
shutil.copyfile(ROOT/'experiments/luna-evidence-v1/evaluator-data.py',HERE/'evaluator-data.py')
shutil.copyfile(ROOT/'experiments/luna-baseline-v1/model-catalog.json',HERE/'model-catalog.json')
s=(ROOT/'experiments/luna-evidence-v1/campaign.mjs').read_text(encoding='utf8').replace('luna-evidence-v1','luna-safeguards-v1')
s=replace(s,'linuxPath,EFFORT','linuxPath,EFFORT,ARM')
s=replace(s,"if(!['i01','q04'].includes(id))",'if(!plan.tasks.includes(id))')
start=s.index('async function preflight(id){');end=s.index('async function zero(){',start)
s=s[:start]+'''async function preflight(id){
 const m=await admit(id);await verifyTask(m);const old=resolve(ROOT,'.suffice/luna-baseline-v2/preflight',id,'validated.json'),proof=await json(old);
 if(!proof.actorNativeValid||!proof.baseline?.originalNativeValid||proof.baseline.accepted!==false||!proof.reference?.accepted)throw Error('Prior independent controls invalid: '+id);
 if(JSON.stringify(proof.sourceHashes)!==JSON.stringify(m.baseHashes))throw Error('Prior control source differs: '+id);
 const receipt={id,at:new Date().toISOString(),reusedFrozenControls:true,priorReceipt:old,priorReceiptSha256:hash(await readFile(old)),actorNativeValid:true,baseline:proof.baseline,reference:proof.reference,sourceHashes:m.baseHashes,networkForGrading:false,dependencyMount:await dependencies(m.task)};
 await save(resolve(DIR,'preflight',id,'validated.json'),receipt);return receipt;
}
'''+s[end:]
s=s.replace("resolve(DIR,'setup',EFFORT", "resolve(DIR,'setup',ARM")
s=replace(s,"effort:EFFORT,inferenceCalls:","arm:ARM,effort:EFFORT,inferenceCalls:")
s=replace(s,"if(!spec||spec.effort!==EFFORT)","if(!spec||spec.effort!==EFFORT||arm!==ARM)")
old="const text=m.prompt+(spec.evidence?'\\n\\nAdditional public behavioral evidence:\\n'+await readFile(resolve(HERE,id+'-context.txt'),'utf8'):'');"
s=replace(s,old,"const text=m.prompt+(spec.safeguards?'\\n\\n'+await readFile(resolve(HERE,'instructions.txt'),'utf8'):'');")
s=s.replace('evidence:spec.evidence','safeguards:spec.safeguards')
s=replace(s,'input:JSON.stringify({prompt:text,limits}),','input:JSON.stringify({prompt:text,limits,...(spec.safeguards?{verification:{publicCommands:t.nativeCommands,nativeExitCodes:t.controls.nativeExitCodes,nativeParser:t.nativeParser,nativeFailureNames:t.controls.nativeFailureNames??t.controls.knownNativeFailures??[],trackedPaths:Object.keys(m.baseHashes),commandTimeoutMs:120000}}:{})}),')
s=replace(s,"const identity=startup?.model.id", "let firstSubmissionGrade=null;const initialPatch=resolve(run,'worker/public-verification/initial-patch.json');if(spec.safeguards&&await exists(initialPatch)){const first=resolve(run,'first-submission');await mkdir(first,{recursive:true});const initial=await json(initialPatch);await save(resolve(first,'patch.json'),initial);firstSubmissionGrade=await grade(m,first,initial);}const identity=startup?.model.id")
s=replace(s,"const result={id:name,task:id,arm,effort:EFFORT,", "const safeguardEvents=events.filter(e=>e.type.startsWith('safeguard_'));const result={id:name,task:id,arm,effort:EFFORT,safeguardEvents:safeguardEvents.filter(e=>!['safeguard_public_command','safeguard_gate'].includes(e.type)),publicGates:safeguardEvents.filter(e=>e.type==='safeguard_gate').map(e=>({phase:e.phase,passed:e.passed,nativeValid:e.nativeValid,preEditProbeObserved:e.preEditProbeObserved,protectedOriginalFilesRestored:e.protectedOriginalFilesRestored})),")
s=replace(s,'grade:grading,patchPaths:', 'grade:grading,firstSubmissionGrade,patchPaths:')
s=s.replace("scope:'Eight predeclared development attempts, one per task/cell; hand-authored evidence and engineering costs excluded; not held-out, confirmatory, or generalizable.'", "scope:plan.scope")
(HERE/'campaign.mjs').write_text(s,encoding='utf8')
s=(ROOT/'experiments/luna-evidence-v1/driver.mjs').read_text(encoding='utf8').replace('luna-evidence-v1','luna-safeguards-v1')
s=replace(s,"async function execute(args,label,effort='low')", "async function execute(args,label,arm='A')")
s=replace(s,'SUFFICE_EVIDENCE_EFFORT:effort','SUFFICE_SAFEGUARDS_ARM:arm')
s=replace(s,"for(const effort of ['low','medium'])for(const mode of ['init','zero']){const r=await execute([campaign,mode],mode+'-'+effort,effort);if(r.code!==0)throw Error('Setup failed '+effort+' '+mode+': '+r.tail);}","for(const arm of ['A','B','C'])for(const mode of ['init','zero']){const r=await execute([campaign,mode],mode+'-'+arm,arm);if(r.code!==0)throw Error('Setup failed '+arm+' '+mode+': '+r.tail);}")
s=replace(s,"for(const task of ['i01','q04'])",'for(const task of plan.tasks)')
s=s.replace("plannedAggregateUsd:.4","plannedAggregateUsd:plan.plannedAggregateUsd")
s=replace(s,"plan.arms[cell.arm].effort)","cell.arm)")
s=s.replace('Parent authorized 2x2 after all ten original Luna calibrations; gate recorded','Human authorized bundled low safeguards versus xhigh; unchanged low control; no subagents')
(HERE/'driver.mjs').write_text(s,encoding='utf8')
s=(ROOT/'experiments/luna-evidence-v1/launch.py').read_text(encoding='utf8').replace('SufficeLunaEvidenceV1','SufficeLunaSafeguardsV1').replace('luna-evidence-v1','luna-safeguards-v1')
(HERE/'launch.py').write_text(s,encoding='utf8')
tasks=['s01','i01','q04','i03','s02','s03','i02','i04','q01','q02']
order=[]
for i,task in enumerate(tasks):
 for arm in ['ABC','BCA','CAB'][i%3]:order.append({'task':task,'arm':arm})
plan={'version':'luna-safeguards-v1','declaredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tasks':tasks,'originalCalibrationTasks':tasks,'arms':{'A':{'effort':'low','safeguards':False},'B':{'effort':'low','safeguards':True},'C':{'effort':'xhigh','safeguards':False}},'order':order,'limits':{'maxCostUsd':.25,'maxTurns':60,'maxCalls':240,'timeoutMs':600000,'commandTimeout':180},'plannedAggregateUsd':7.5,'deadline':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=4)).isoformat(),'maximumConcurrentActors':1,'subagents':False,'scope':'Original ten issue packages reused for a predeclared development-rescue comparison; 30 fresh actor sessions, not fresh issues or confirmatory holdout. Repeated low is a contemporaneous control. One observation/task/arm; engineering overhead excluded. Fresh transfer, if prepared, must be separately frozen and reported.'}
(HERE/'plan.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf8')
print(json.dumps({'prepared':'new adapters only','tasks':len(tasks),'attempts':len(order),'inferenceCalls':0}))
