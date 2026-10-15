"""Create separately versioned runtime copies; never change the frozen parents."""
import pathlib,json,hashlib,shutil
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
parent=ROOT/'experiments/luna-baseline-v1/runtime-source'
original=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text(encoding='utf8'))['inputs']
for arm,effort in [('A','low'),('B','low'),('C','xhigh')]:
 out=HERE/'variants'/arm/'runtime-source'; manifest={}
 for rel in original:
  b=(parent/rel).read_bytes();before=b;edits=[]
  def replace(old,new):
   global b
   if old not in b.decode():raise RuntimeError('Missing expected source: '+rel+' '+old[:80])
   b=b.replace(old.encode(),new.encode());edits.append({'from':old,'to':new})
  if rel=='configs/general-v1.json':replace('"maxCostUsd": 0.75','"maxCostUsd": 0.25')
  if effort!='low':
   if rel=='configs/general-v1.json':replace('"effort": "low"','"effort": "'+effort+'"')
   if rel=='src/general/agent.mjs':replace("p.reasoning?.effort!=='low'","p.reasoning?.effort!=='"+effort+"'");replace("thinkingLevel:'low'","thinkingLevel:'"+effort+"'")
  if arm=='B':
   if rel=='src/general/entry.mjs':replace('preflight:config.preflight??false','preflight:config.preflight??false,verification:config.verification')
   if rel=='src/general/agent.mjs':
    replace("import {stateDir} from '../runtime.mjs';","import {stateDir} from '../runtime.mjs';\nimport {createSafeguards} from './verification.mjs';")
    replace('limits,preflight=false})','limits,preflight=false,verification})')
    replace('const tools=repositoryTools({workspace,signal:controller.signal,log,commandTimeout:limits.commandTimeout??180});',"const safeguards=preflight?null:await createSafeguards({workspace,runDir,verification,log,signal:controller.signal});\n const tools=repositoryTools({workspace,signal:controller.signal,log,commandTimeout:limits.commandTimeout??180}).map(t=>safeguards?safeguards.wrap(t):t);")
    replace('if(!preflight)await session.prompt(prompt);',"if(!preflight){\n   await session.prompt(prompt);\n   if(!controller.signal.aborted){const gate=await safeguards.runGate('initial');\n    if(!gate.passed&&usage.estimatedApiUsd<limits.maxCostUsd&&turns<limits.maxTurns&&calls<limits.maxCalls&&!controller.signal.aborted){log({type:'safeguard_repair_continuation',number:1});await session.prompt(safeguards.feedback(gate));if(!controller.signal.aborted)await safeguards.runGate('after-repair');}\n    log({type:'safeguard_summary',...safeguards.summary()});\n   }\n  }")
    replace('const result={version:VERSION,status,turns,calls,usage,',"const result={version:VERSION,status,publicVerification:safeguards?.summary()??null,turns,calls,usage,")
  dest=out/rel;dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists() and dest.read_bytes()!=b and (ROOT/'.suffice/luna-safeguards-v1/manifest.json').exists():raise RuntimeError('Refuse to replace frozen variant: '+str(dest))
  dest.write_bytes(b);manifest[rel]={'parentSha256':sha(before),'variantSha256':sha(b),'substitutions':edits}
 if arm=='B':
  b=(HERE/'verification.mjs').read_bytes();dest=out/'src/general/verification.mjs';dest.write_bytes(b);manifest['src/general/verification.mjs']={'parentSha256':None,'variantSha256':sha(b),'substitutions':[],'addedForPublicGate':True}
 p=HERE/'variants'/arm/'source-manifest.json';p.write_text(json.dumps({'arm':arm,'effort':effort,'inputs':manifest},indent=2)+'\n',encoding='utf8')
print(json.dumps({'prepared':['A','B','C'],'originalInputs':len(original),'inferenceCalls':0}))
