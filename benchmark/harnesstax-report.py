"""Read-only aggregation; never supplies evaluator feedback to an actor."""
import hashlib
import json
from pathlib import Path
import statistics
import time

STATE=Path('/home/eric_qin/suffice-harnesstax-sol61')
OUT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/reports/harnesstax-sol61-v1')
manifest=json.loads((STATE/'manifest.json').read_text())
rows=[]
for job in manifest['jobs']:
    name=job['task']+'-'+job['arm']
    path=STATE/'results'/(name+'.json')
    if not path.exists(): continue
    trial=json.loads(path.read_text())
    root=STATE/'trials'/name/'agent/receipts'
    worker_path=root/'worker.json'
    worker=json.loads(worker_path.read_text()) if worker_path.exists() else {}
    usage=worker.get('usage',{})
    reward=(trial.get('verifier_result') or {}).get('rewards')
    accepted=bool(reward) and all(v==1 for v in reward.values())
    unknown=not worker or usage.get('costUnknown',False) or worker.get('usageCostUnknown',False)
    identity=worker.get('identity')
    requests=[]
    for p in root.rglob('*.jsonl'):
        if '/events/' not in str(p) and p.name!='events.live.jsonl': continue
        for line in p.read_text(errors='replace').splitlines():
            try: event=json.loads(line)
            except json.JSONDecodeError: unknown=True;continue
            if event.get('type')=='provider_request': requests.append(event)
    if job['arm'] in ['v1','v2']:
        identity=bool(requests) and all(e.get('model') in
            (['gpt-6.1-sol'] if job['arm']=='v1' else ['gpt-6-luna','gpt-6.1-sol'])
            for e in requests)
    row={**job,'accepted':accepted,'officialReward':reward,
      'status':worker.get('status'),'identity':identity,
      'costUnknown':bool(unknown),'knownCostUsd':usage.get('estimatedApiUsd',0),
      'costUsd':None if unknown else usage.get('estimatedApiUsd'),
      'latencyMs':worker.get('latencyMs'),'usage':usage,
      'modelCalls':worker.get('modelCalls',worker.get('turns',usage.get('modelCalls'))),
      'toolCalls':worker.get('toolCalls',worker.get('calls',usage.get('toolCalls'))),
      'publicVerification':worker.get('verificationStatus'),
      'adviceCalls':worker.get('adviceCalls',0),'repairs':worker.get('repairs',0),
      'takeovers':worker.get('escalations',0),
      'exceptionType':(trial.get('exception_info') or {}).get('exception_type'),
      'agentTiming':trial.get('agent_execution'),'setupTiming':trial.get('agent_setup'),
      'trialResultSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
      'workerSha256':hashlib.sha256(worker_path.read_bytes()).hexdigest() if worker_path.exists() else None}
    rows.append(row)
summary=[]
for arm in ['codex','pi','v1','v2']:
    group=[r for r in rows if r['arm']==arm]
    lat=[r['latencyMs']/1000 for r in group if r['latencyMs'] is not None]
    summary.append({'arm':arm,'completed':len(group),'accepted':sum(r['accepted'] for r in group),
      'knownCostUsd':sum(r['knownCostUsd'] for r in group),
      'unknownCosts':sum(r['costUnknown'] for r in group),
      'meanSeconds':statistics.mean(lat) if lat else None,
      'adviceCalls':sum(r['adviceCalls'] for r in group),
      'repairs':sum(r['repairs'] for r in group),'takeovers':sum(r['takeovers'] for r in group)})
OUT.mkdir(parents=True,exist_ok=True)
data={'asOf':time.time(),'complete':len(rows)==120,'attempts':rows,'summary':summary}
(OUT/'results.json').write_text(json.dumps(data,indent=2)+'\n')
lines=['# HarnessTax Sol 6.1 single round', '',f'Completed: {len(rows)}/120 attempts. '+('Final.' if len(rows)==120 else 'Interim; not a final comparison.'),'',
 '| Arm | Completed | Accepted | Known cost (USD) | Unknown costs | Mean agent seconds |',
 '| --- | ---: | ---: | ---: | ---: | ---: |']
for r in summary:
    seconds='—' if r['meanSeconds'] is None else f"{r['meanSeconds']:.1f}"
    lines.append(f"| {r['arm']} | {r['completed']}/30 | {r['accepted']} | {r['knownCostUsd']:.6f} | {r['unknownCosts']} | {seconds} |")
lines+=['','API-equivalent cost estimates, not subscription charges. Unknown costs remain unknown.',
 'One attempt per task/arm; no replacement runs. All errors and failures remain in the denominator.',
 'V2 changes model as well as pipeline. Codex/Pi/V1 match Sol High; V2 is a system comparison.',
 '100-response cap; first provider-failed attempt had the initial 60 cap but made zero responses.',
 'V2 controller smoke checks cover 3/30 tasks, solely from public instructions. Other tasks have no controller verification trigger.',
 'No private grader feedback is used for Sol escalation. Passing a public smoke check does not establish correctness.',
 'Source and dependency pins, full cohort, limits and preflight are in manifest.json, preflight.json and benchmark/harnesstax-plan.md.',
 'Historical Pi $0.420517/attempt was GPT-5.6-Sol High with three repetitions and is not this run\'s control.',
 '',f"Sol advice calls: {sum(r['adviceCalls'] for r in rows)}; repairs: {sum(r['repairs'] for r in rows)}; takeovers: {sum(r['takeovers'] for r in rows)}."]
(OUT/'RESULTS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'completed':len(rows),'summary':summary}))
