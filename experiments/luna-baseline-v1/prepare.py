"""Prepare a separate model-only variant; no inference, installs, or main-runtime writes."""
import hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
VERSION = 'luna-baseline-v1'
def sha(b): return hashlib.sha256(b).hexdigest()
def put(rel, data):
    p = HERE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and p.read_bytes() != data and (ROOT/'.suffice/luna-baseline-v1/manifest.json').exists():
        raise RuntimeError('Preserve existing variant; changed preparation requires a new version: '+str(p))
    p.write_bytes(data)

frozen = json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text())
inputs = {}
for rel, expected in frozen['inputs'].items():
    original = (ROOT/rel).read_bytes()
    if sha(original) != expected: raise RuntimeError('Frozen source drift: '+rel)
    variant = original
    replacements = []
    if rel in ['configs/general-v1.json', 'src/general/agent.mjs', 'src/general/entry.mjs']:
        for old, new in [(b'gpt-6.1-sol', b'gpt-6-luna'), (b'Sol subscription required', b'Luna subscription required')]:
            count = variant.count(old)
            variant = variant.replace(old, new)
            if count: replacements.append({'from':old.decode(), 'to':new.decode(), 'count':count})
        restored = variant.replace(b'gpt-6-luna', b'gpt-6.1-sol').replace(b'Luna subscription required', b'Sol subscription required')
        if restored != original: raise RuntimeError('Non-model substitution: '+rel)
    put('runtime-source/'+rel, variant)
    inputs[rel] = {'originalSha256':expected, 'variantSha256':sha(variant), 'substitutions':replacements}

execution = (ROOT/'scripts/sonion-execution.mjs').read_text()
execution = execution.replace("ROOT=resolve(import.meta.dirname,'..')", "ROOT=resolve(import.meta.dirname,'../..')")
execution = execution.replace("export const LINUX_RUNTIME='/home/eric_qin/suffice-general-runtime';", "export const LINUX_RUNTIME='/home/eric_qin/suffice-luna-runtime-v1';\nconst NODE_RUNTIME='/home/eric_qin/suffice-general-runtime';")
start = execution.index('export async function stageRuntime()')
end = execution.index('export async function executeIsolated', start)
execution = execution[:start]+'''export async function stageRuntime(){
 const manifest=JSON.parse(await (await import('node:fs/promises')).readFile(resolve(ROOT,'experiments/luna-baseline-v1/source-manifest.json'),'utf8'));
 const crypto=await import('node:crypto');
 for(const [p,entry] of Object.entries(manifest.inputs)){
  const source=resolve(ROOT,'experiments/luna-baseline-v1/runtime-source',p),target=resolve(LINUX_RUNTIME,'app',p);
  const bytes=await (await import('node:fs/promises')).readFile(source);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.variantSha256)throw new Error('Variant source drift: '+p);
  await mkdir(resolve(target,'..'),{recursive:true});await copyFile(source,target);
 }
 await mkdir(resolve(LINUX_RUNTIME,'app/node_modules'),{recursive:true});
 await mkdir(resolve(LINUX_RUNTIME,'app/.suffice/pi'),{recursive:true});
 return Object.keys(manifest.inputs);
}
'''+execution[end:]
execution = execution.replace("'--ro-bind',LINUX_RUNTIME,'/node'", "'--ro-bind',NODE_RUNTIME,'/node'")
execution = execution.replace("'--ro-bind',LINUX_RUNTIME+'/app','/runtime'", "'--ro-bind',LINUX_RUNTIME+'/app','/runtime','--ro-bind',NODE_RUNTIME+'/app/node_modules','/runtime/node_modules'")
put('execution.mjs',execution.encode())

data = (ROOT/'scripts/sonion-data-v2.py').read_text().replace("ROOT=pathlib.Path(__file__).resolve().parents[1]", "ROOT=pathlib.Path(__file__).resolve().parents[2]")
put('evaluator-data.py',data.encode())

campaign = (ROOT/'scripts/sonion-campaign-v2.mjs').read_text()
campaign = campaign.replace("from './sonion-execution.mjs'", "from './execution.mjs'").replace("from './freeze-general.mjs'", "from '../../scripts/freeze-general.mjs'")
campaign = campaign.replace("'.suffice/field-campaign-v2'", "'.suffice/luna-baseline-v1'").replace("'reports/field-campaign-v2'", "'reports/luna-baseline-v1'")
campaign = campaign.replace("'configs/general-v1.json'", "'experiments/luna-baseline-v1/runtime-source/configs/general-v1.json'")
campaign = campaign.replace("'scripts/sonion-data-v2.py'", "'experiments/luna-baseline-v1/evaluator-data.py'")
campaign = campaign.replace("['scripts/sonion-campaign-v2.mjs','experiments/luna-baseline-v1/evaluator-data.py','scripts/sonion-execution.mjs','docs/SONION-EVALUATOR-V2.md']", "['experiments/luna-baseline-v1/campaign.mjs','experiments/luna-baseline-v1/evaluator-data.py','experiments/luna-baseline-v1/execution.mjs','experiments/luna-baseline-v1/PROTOCOL.md','experiments/luna-baseline-v1/source-manifest.json']")
campaign = campaign.replace("version:'field-campaign-v2'", "version:'luna-baseline-v1'").replace("historicalTarget:10,liveTarget:3", "historicalTarget:4,liveTarget:0")
campaign = campaign.replace('gpt-6.1-sol','gpt-6-luna')
campaign = campaign.replace("async function admit(id){await verify();", "async function admit(id){if(!['s01','i01','q04','i03'].includes(id))throw new Error('Task not predeclared');await verify();")
campaign = campaign.replace("const arms=m.task.cohort==='historical'?[m.firstArm,m.firstArm==='suffice'?'stock-pi':'suffice']:['suffice'];", "const arms=['suffice'];")
campaign = campaign.replace("const workers=Array.from({length:Math.min(2,tasks.length)}", "const workers=Array.from({length:Math.min(1,tasks.length)}")
campaign = campaign.replace("const limits={", "const catalog=JSON.parse(await readFile(resolve(ROOT,'experiments/luna-baseline-v1/model-catalog.json'),'utf8'));\nconst limits={",1)
campaign = campaign.replace("'experiments/luna-baseline-v1/source-manifest.json']", "'experiments/luna-baseline-v1/source-manifest.json','experiments/luna-baseline-v1/model-catalog.json']")
campaign = campaign.replace("const identity=requests.length>0&&", "const identity=startup?.model.id==='gpt-6-luna'&&JSON.stringify(startup?.model.cost)===JSON.stringify(catalog.model.cost)&&events.filter(e=>e.type==='assistant').every(e=>e.model==='gpt-6-luna')&&requests.length>0&&")
campaign = campaign.replace("scope:'Frozen general-v1 versus native Pi, actual GitHub issue campaign. Benchmark inference estimates only; engineering/evaluator inference excluded.'", "scope:'Exposed historical Luna calibration, four predeclared tasks; unchanged Suffice architecture. Sol campaign reference is separate; no Astra comparison. Benchmark inference estimates only.'")
# This file is copied evaluator infrastructure; it is never part of an actor mount.
put('campaign.mjs',campaign.encode())

manifest = {'version':VERSION, 'parent':'suffice-general-v1', 'model':'gpt-6-luna', 'provider':'openai', 'effort':'low', 'architectureChanges':False, 'sourceVersionLabelsRetained':True, 'inputs':inputs,
 'evaluatorParents':{p:sha((ROOT/p).read_bytes()) for p in ['scripts/sonion-campaign-v2.mjs','scripts/sonion-data-v2.py','scripts/sonion-execution.mjs']},
 'variantHostFiles':{p:sha((HERE/p).read_bytes()) for p in ['campaign.mjs','evaluator-data.py','execution.mjs']},
 'limits':{'maxCostUsd':10,'maxTurns':60,'maxCalls':240,'timeoutMs':600000,'commandTimeout':180},
 'tasks':['s01','i01','q04','i03'], 'scope':'Exposed historical calibration; not untouched heldout capability evidence',
 'remoteRuntime':'/home/eric_qin/suffice-luna-runtime-v1/app', 'nodeAndDependencies':'Existing pinned general runtime bound read-only; not reinstalled', 'actorInferenceAllowed':False}
put('source-manifest.json',(json.dumps(manifest,indent=2)+'\n').encode())
print(json.dumps({'prepared':VERSION,'frozenInputs':len(inputs),'changedInputs':[p for p,e in inputs.items() if e['substitutions']], 'inferenceCalls':0}))
