"""Reuse unchanged field grading and filesystem helpers in a separate campaign."""
import pathlib,json,datetime
ROOT=pathlib.Path(__file__).resolve().parents[2];HERE=pathlib.Path(__file__).resolve().parent
def rep(s,a,b):
 assert a in s,a[:80]
 return s.replace(a,b)
s=(ROOT/'scripts/sonion-campaign-v2.mjs').read_text()
s=rep(s,"from './sonion-execution.mjs'","from './execution.mjs'")
s=rep(s,"from './freeze-general.mjs'","from '../../scripts/freeze-general.mjs'")
s=s.replace('field-campaign-v2','codex-sol-xhigh-v1').replace("'stock-pi'","'codex'")
s=rep(s,"const limits={...JSON.parse(await readFile(resolve(ROOT,'configs/general-v1.json'),'utf8')).limits,maxCostUsd:10};","const limits={...JSON.parse(await readFile(resolve(ROOT,'configs/general-v1.json'),'utf8')).limits,maxCostUsd:10};")
start=s.index('async function init()');end=s.index('async function verify()',start)
s=s[:start]+'''async function init(){await verifyGeneral();await mkdir(DIR,{recursive:true});const file=resolve(DIR,'manifest.json');if(await exists(file))return json(file);const inputs=await filesUnder(resolve(ROOT,'experiments/codex-sol-xhigh-v1'));for(const p of ['scripts/sonion-data-v2.py','scripts/freeze-general.mjs'])inputs[resolve(ROOT,p)]=hash(await readFile(resolve(ROOT,p)));const m={at:new Date().toISOString(),version:'codex-sol-xhigh-v1',frozenGeneral:await verifyGeneral(),limits,order,inputs,policy,model:'gpt-6.1-sol',effort:'xhigh',nativeCodexVersion:'0.163.0',scope:'Previously exposed ten-task development comparison, not fresh holdout.'};await save(file,m);return m;}
'''+s[end:]
start=s.index('async function preflight(');end=s.index('let active=0;',start)
s=s[:start]+'''async function preflight(id){const m=await admit(id);await verifyTask(m);const old=resolve(ROOT,'.suffice/luna-baseline-v2/preflight',id,'validated.json'),proof=await json(old);if(!proof.actorNativeValid||!proof.baseline.originalNativeValid||proof.baseline.accepted!==false||!proof.reference.accepted)throw Error('Prior controls invalid '+id);if(JSON.stringify(proof.sourceHashes)!==JSON.stringify(m.baseHashes))throw Error('Control source drift '+id);const out={id,reusedFrozenControls:true,source:old,sourceSha256:hash(await readFile(old)),sourceHashes:m.baseHashes,baseline:proof.baseline,reference:proof.reference};await save(resolve(DIR,'preflight',id,'validated.json'),out);return out;}
'''+s[end:]
start=s.index('async function attempt(');end=s.index('async function pair(',start)
s=s[:start]+(HERE/'attempt-template.mjs').read_text()+s[end:]
s=s.replace("'Frozen general-v1 versus native Pi, actual GitHub issue campaign. Benchmark inference estimates only; engineering/evaluator inference excluded.'","'Suffice versus native Codex 0.163.0, same ten exposed historical issues, both Sol xhigh. Inference estimates only; setup and engineering are separately reported.'")
(HERE/'campaign.mjs').write_text(s)
tasks=['s01','i01','q04','i03','s02','s03','i02','i04','q01','q02']
(HERE/'plan.json').write_text(json.dumps({'version':'codex-sol-xhigh-v1','tasks':tasks,'model':'gpt-6.1-sol','effort':'xhigh','perTaskPerHarnessCeilingUsd':10,'taskCount':10,'attemptCount':20,'maximumConcurrentActors':2,'exposure':'reused development cohort','pairedOrderCounterbalanced':True},indent=2)+'\n')
launch=(ROOT/'experiments/luna-safeguards-v1/launch.py').read_text().replace('SufficeLunaSafeguardsV1','SufficeCodexSolXhighV1').replace('luna-safeguards-v1','codex-sol-xhigh-v1')
(HERE/'launch.py').write_text(launch)
print(json.dumps({'attempts':20,'newHarnessMechanisms':0,'inferenceCalls':0}))
