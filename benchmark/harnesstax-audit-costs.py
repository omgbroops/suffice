import hashlib
import json
from pathlib import Path

state=Path('/home/eric_qin/suffice-harnesstax-sol61')
out=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/reports/harnesstax-sol61-v1')
names=['adaptive-rejection-sampler-codex','financial-document-processor-v1','make-doom-for-mips-v1']
def hashes(name):
    root=state/'trials'/name
    files=[state/'results'/(name+'.json')]+[p for p in (root/'agent').rglob('*') if p.is_file()]
    return {str(p.relative_to(state)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
before={name:hashes(name) for name in names}
root=state/'trials/financial-document-processor-v1/agent/receipts'
worker=json.loads((root/'worker.json').read_text())
events=[];unicode_splits=0
for p in (root/'solve/state/events').glob('*.jsonl'):
    data=p.read_text()
    unicode_splits+=len(data.splitlines())-len(data.split('\n'))+int(data.endswith('\n'))
    events.extend(json.loads(line) for line in data.split('\n') if line.strip())
assistants=[e for e in events if e.get('type')=='assistant']
requests=[e for e in events if e.get('type')=='provider_request']
raw={e['responseId']:e['usage'] for e in events if e.get('type')=='provider_usage'}
totals={k:sum(e['usage'].get(k,0) for e in assistants) for k in ['input','cacheRead','cacheWrite','output']}
cost=sum(e['usage']['cost']['total'] for e in assistants)
assert len(assistants)==len(requests)==len(raw)==worker['usage']['modelCalls']==8
assert all(totals[k]==worker['usage'][k] for k in totals)
assert sum(e['input_tokens'] for e in raw.values())==sum(totals[k] for k in ['input','cacheRead','cacheWrite'])
assert sum(e['output_tokens'] for e in raw.values())==totals['output']
assert abs(cost-worker['usage']['estimatedApiUsd'])<1e-9
assert all(e['model']=='gpt-6.1-sol' and e['reasoning']['effort']=='high' and e['toolNames']==['codemode'] for e in requests)
codex=json.loads((state/'trials/adaptive-rejection-sampler-codex/agent/receipts/worker.json').read_text())
doom=json.loads((state/'results/make-doom-for-mips-v1.json').read_text())
assert codex['turns']==0 and codex['usage']['estimatedApiUsd']==0
assert doom['exception_info']['exception_type']=='AgentTimeoutError'
assert not (state/'trials/make-doom-for-mips-v1/agent/receipts').exists()
after={name:hashes(name) for name in names}
assert before==after
audit={
    'scope':'Offline audit of three incomplete accounting flags; no model or grader reruns and no original receipt changes.',
    'recovered':{
        'attempt':names[1],'estimatedApiUsd':cost,'responses':len(raw),'usage':totals,
        'finding':'All LF-delimited JSON records are valid. Python splitlines() incorrectly split legal Unicode characters in a tool result. Worker, assistant ledger and provider receipts reconcile.',
        'spuriousLineSplits':unicode_splits,'modelIdentityVerified':True,
        'effect':'Cost unchanged; costUnknown false and the already accepted patch now satisfies accounting policy.'},
    'unresolved':[
        {'attempt':names[0],'knownCostUsd':0,'observedModelResponses':0,
         'finding':'Workspace routing discovery failed before any response or usage record. Model cost is likely zero, but the failed transport provides no final provider accounting acknowledgment. Retain unknown whole-attempt cost.'},
        {'attempt':names[2],'knownCostUsd':0,
         'finding':'Outer timeout at approximately 900 seconds. No worker or response receipts survived. Original config did not bind-mount /receipts; original container no longer exists. No exact historical usage can be recovered from retained artifacts.',
         'prevention':'Later attempts already persist live receipts and stop timed-out actor processes before grading.'}],
    'originalArtifactSha256Before':before,'originalArtifactSha256After':after,'originalsUnchanged':True,
    'comparisonScores':'No evaluator reward changed. Existing snapshots remain unchanged. No replacement or additional attempt authorized or performed by this audit.',
}
(out/'cost-accounting-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({'recoveredAttempt':names[1],'reconciledCostUsd':cost,'unresolved':2,'originalsUnchanged':True}))
