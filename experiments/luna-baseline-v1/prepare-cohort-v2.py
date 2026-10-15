"""Pre-inference expansion; preserve the already frozen four-task v1 manifest."""
import hashlib,json,pathlib
HERE=pathlib.Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
primary=['s01','i01','q04','i03']
secondary=['s02','s03','i02','i04','q01','q02']
source=(HERE/'campaign.mjs').read_text()
source=source.replace("'.suffice/luna-baseline-v1'","'.suffice/luna-baseline-v2'").replace("'reports/luna-baseline-v1'","'reports/luna-baseline-v2'")
source=source.replace("version:'luna-baseline-v1'","version:'luna-baseline-v2'").replace("historicalTarget:4,liveTarget:0","historicalTarget:10,liveTarget:0")
source=source.replace("['s01','i01','q04','i03'].includes(id)","['s01','i01','q04','i03','s02','s03','i02','i04','q01','q02'].includes(id)")
source=source.replace("'experiments/luna-baseline-v1/campaign.mjs'","'experiments/luna-baseline-v1/campaign-v2.mjs'").replace("'experiments/luna-baseline-v1/PROTOCOL.md'","'experiments/luna-baseline-v1/PROTOCOL-V2.md'")
source=source.replace("'experiments/luna-baseline-v1/model-catalog.json']","'experiments/luna-baseline-v1/model-catalog.json','experiments/luna-baseline-v1/cohort-v2-manifest.json']")
source=source.replace('Exposed historical Luna calibration, four predeclared tasks','Exposed historical Luna calibration, ten predeclared tasks; original four primary, six secondary')
target=HERE/'campaign-v2.mjs'
if target.exists() and target.read_text()!=source:raise RuntimeError('Preserve cohort v2 source')
target.write_text(source)
manifest={'version':'luna-baseline-v2','reason':'Expand predeclared calibration cohort before any Luna inference; preserve four-task v1 setup', 'primary':primary,'secondary':secondary,'serialOrder':primary+secondary,'inferenceCallsAtDeclaration':0,'runtimeVariant':'luna-baseline-v1; unchanged', 'limits':{'maxCostUsd':10,'maxTurns':60,'maxCalls':240,'timeoutMs':600000},'costGoal':'Aim below $1 total known benchmark inference; not a changed per-attempt ceiling','sourceSha256':sha(target.read_bytes()),'runtimeSourceManifestSha256':sha((HERE/'source-manifest.json').read_bytes()),'protocolSha256':sha((HERE/'PROTOCOL-V2.md').read_bytes()),'launchGate':'Parent confirmation that main comparative set is complete; no actor call authorized by preparation'}
p=HERE/'cohort-v2-manifest.json';data=json.dumps(manifest,indent=2)+'\n'
if p.exists() and p.read_text()!=data:raise RuntimeError('Preserve cohort v2 manifest')
p.write_text(data)
print(json.dumps({'prepared':manifest['version'],'tasks':primary+secondary,'inferenceCalls':0}))
