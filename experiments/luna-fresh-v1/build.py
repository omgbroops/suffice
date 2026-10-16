"""Derive a separately versioned campaign; refuse to change any frozen input."""
import hashlib,json,pathlib,shutil,datetime
ROOT=pathlib.Path(__file__).resolve().parents[2];HERE=ROOT/'experiments/luna-fresh-v1';OLD=ROOT/'experiments/luna-safeguards-v1'
if (ROOT/'.suffice/luna-fresh-v1/manifest.json').exists():raise SystemExit('Already frozen; no rebuild')
sha=lambda b:hashlib.sha256(b).hexdigest()
for arm in ['A','B','S']:
 src=OLD/'variants/C/runtime-source';dest=HERE/f'variants/{arm}/runtime-source'
 shutil.copytree(src,dest,dirs_exist_ok=True)
 if arm=='B':
  shutil.copyfile(HERE/'public-gate.mjs',dest/'src/general/public-gate.mjs')
  p=dest/'src/general/agent.mjs';s=p.read_text(encoding='utf8')
  s="import {createPublicGate} from './public-gate.mjs';\n"+s
  s=s.replace('limits,preflight=false','limits,preflight=false,verification=null')
  s=s.replace("const names=tools.map(t=>t.name);","const names=tools.map(t=>t.name);\n const preservation=verification&&!preflight?await createPublicGate({workspace,runDir,verification,log,signal:controller.signal}):null;")
  s=s.replace('if(!preflight)await session.prompt(prompt);',"""if(!preflight){
   await session.prompt(prompt);
   if(preservation&&!controller.signal.aborted){
    const initial=await preservation.runGate('initial');
    if(!initial.passed&&usage.estimatedApiUsd<limits.maxCostUsd&&turns<limits.maxTurns&&calls<limits.maxCalls&&!controller.signal.aborted){
     log({type:'preservation_repair',reason:'original_public_regression_failure',costBefore:usage.estimatedApiUsd});
     await session.prompt(preservation.feedback(initial));
     if(!controller.signal.aborted)await preservation.runGate('after-repair');
    }
   }
  }""")
  s=s.replace('usageCostUnknown:unknown,errors,final,','usageCostUnknown:unknown,errors,final,publicVerification:preservation?.summary()??null,')
  p.write_text(s,encoding='utf8')
  p=dest/'src/general/entry.mjs';s=p.read_text(encoding='utf8').replace('preflight:config.preflight??false','preflight:config.preflight??false,verification:config.verification??null');p.write_text(s,encoding='utf8')
 if arm=='S':
  for rel in ['src/general/agent.mjs','src/general/entry.mjs','configs/general-v1.json']:
   p=dest/rel;s=p.read_text(encoding='utf8').replace('gpt-6-luna','gpt-6.1-sol').replace("'xhigh'","'low'").replace('"xhigh"','"low"');p.write_text(s,encoding='utf8')
 manifest={'arm':arm,'effort':'low' if arm=='S' else 'xhigh','inputs':{p.relative_to(dest).as_posix():{'variantSha256':sha(p.read_bytes())} for p in sorted(dest.rglob('*')) if p.is_file()}}
 (dest.parent/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 shutil.copyfile(OLD/'model-catalog.json',HERE/'model-catalog.json')
shutil.copyfile(OLD/'evaluator-data.py',HERE/'evaluator-data.py')
s=(OLD/'execution.mjs').read_text(encoding='utf8').replace('luna-safeguards-v1','luna-fresh-v1').replace('SUFFICE_SAFEGUARDS_ARM','SUFFICE_FRESH_ARM').replace("['A','B','C']","['A','B','S']").replace("ARM==='C'?'xhigh':'low'","ARM==='S'?'low':'xhigh'")
(HERE/'execution.mjs').write_text(s,encoding='utf8')
s=(OLD/'campaign.mjs').read_text(encoding='utf8').replace('luna-safeguards-v1','luna-fresh-v1').replace("'.suffice/field-campaign-v1/tasks'","'.suffice/luna-fresh-v1/tasks'")
start=s.index('async function gate()');end=s.index('async function admit(',start)
s=s[:start]+"async function gate(){return {ready:true};}\n"+s[end:]
s=s.replace("if(t.referencePatch)inputs[t.referencePatch]=hash(await readFile(t.referencePatch));","if(t.referencePatch)inputs[t.referencePatch]=hash(await readFile(t.referencePatch));if(t.referencePatchJson)inputs[t.referencePatchJson]=hash(await readFile(t.referencePatchJson));")
start=s.index('async function preflight(');end=s.index('async function zero()',start)
s=s[:start]+"""async function preflight(id){
 const m=await admit(id);await verifyTask(m);
 const root=resolve(DIR,'preflight',id);await mkdir(root,{recursive:true});
 const controls={};for(const label of ['baseline','reference']){
  const run=resolve(root,label);await mkdir(run,{recursive:true});const patch=label==='baseline'?[]:await json(m.task.referencePatchJson);await save(resolve(run,'patch.json'),patch);controls[label]=await grade(m,run,patch);
 }
 const valid=controls.baseline.originalNativeValid&&!controls.baseline.accepted&&controls.reference.accepted;
 const receipt={id,at:new Date().toISOString(),...controls,sourceHashes:m.baseHashes,actorNativeValid:controls.baseline.originalNativeValid,passed:valid};await save(resolve(root,'validated.json'),receipt);if(!valid)throw Error('Fresh controls invalid: '+id);return receipt;
}
"""+s[end:]
s=s.replace("const text=m.prompt+(spec.safeguards?'\\n\\n'+await readFile(resolve(HERE,'instructions.txt'),'utf8'):'');","const text=m.prompt;")
s=s.replace("e.type.startsWith('safeguard_')","e.type.startsWith('preservation_')").replace("e.type==='safeguard_gate'","e.type==='preservation_gate'")
s=s.replace("['safeguard_public_command','safeguard_gate']","['preservation_command','preservation_gate']")
# Arm S is reserved for a separately audited continuation. Never included automatically.
s=s.replace("const identity=startup?.model.id==='gpt-6-luna'", "const identity=startup?.model.id===(ARM==='S'?'gpt-6.1-sol':'gpt-6-luna')")
# Source control checks above run model-free; their task readiness is not inferred.
(HERE/'campaign.mjs').write_text(s,encoding='utf8')
tasks=['f01','f02','f03','f04','f05','f06']
plan={'version':'luna-fresh-v1','declaredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tasks':tasks,'arms':{'A':{'effort':'xhigh','safeguards':False},'B':{'effort':'xhigh','safeguards':True}},'order':[{'task':t,'arm':'A'} for t in tasks]+[{'task':t,'arm':'B'} for t in reversed(tasks)],'limits':{'maxCostUsd':.15,'maxTurns':60,'maxCalls':240,'timeoutMs':600000,'commandTimeout':180},'scope':'Six fresh-to-actor GitHub issues, four repositories; development task 7/10 is not validation. Baseline phase precedes treatment as requested; phase/cache order remains a limitation. Three p-map tasks share a repo: not six independent repository samples. Upstream issue bodies may contain hints. API-equivalent inference only, not subscription charges. Engineering inference excluded.','handoffSignal':{'frozenBeforeLabels':True,'rule':'Route only if original public regression commands fail, worker has not completed operationally, or no production patch was submitted. No hidden checks, model confidence judge, or hidden result in feedback.','cost':'Deterministic public checks; all Luna and any Sol continuation charges sum within the same .15 allowance.','initialStudy':'Offline precision/recall from A original-native result; live Sol only after staged results warrant it.'},'plannedAggregateUsd':1.8,'solFollowupMaximumAdditionalUsd':.9,'deadline':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=4)).isoformat()}
(HERE/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
s=(OLD/'driver.mjs').read_text(encoding='utf8').replace('luna-safeguards-v1','luna-fresh-v1').replace('SUFFICE_SAFEGUARDS_ARM','SUFFICE_FRESH_ARM').replace("['A','B','C']","['A','B']")
s=s.replace("'Original calibration", "'Fresh calibration")
# Model-free preflight was run and preserved before this driver may invoke actors.
s=s.replace("for(const task of plan.tasks){active='controls-'+task;", "for(const task of []){active='controls-'+task;")
s=s.replace("active=id;await save();", "active=id;await save();")
s=s.replace("authorizedBy:'Human authorized bundled low safeguards versus xhigh; unchanged low control; no subagents'","authorizedBy:'Human authorized fresh Luna xhigh then xhigh plus ONE original-public regression gate; no subagents'")
(HERE/'driver.mjs').write_text(s,encoding='utf8')
s=(OLD/'launch.py').read_text(encoding='utf8').replace('LunaSafeguardsV1','LunaFreshV1').replace('luna-safeguards-v1','luna-fresh-v1')
(HERE/'launch.py').write_text(s,encoding='utf8')
print(json.dumps({'prepared':str(HERE),'tasks':tasks,'model':'gpt-6-luna','effort':'xhigh','limits':plan['limits']}))
