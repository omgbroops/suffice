"""Read-only aggregation; never supplies evaluator feedback to an actor."""
import hashlib
import json
from pathlib import Path
import statistics
import time
import os
from datetime import datetime

STATE=Path(os.environ.get('HARNESS_TAX_REPORT_STATE','/home/eric_qin/suffice-harnesstax-sol61'))
OUT=Path(os.environ.get('HARNESS_TAX_REPORT_OUT','/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/reports/harnesstax-sol61-v1'))
manifest=json.loads((STATE/'manifest.json').read_text())
arms=manifest.get('arms',['codex','pi','v1','v2'])
expected=len(manifest['jobs'])
replacement_plan=json.loads((STATE/'replacement-plan.json').read_text()) if (STATE/'replacement-plan.json').exists() else None
replacement_keys={(j['task'],j['arm']) for j in replacement_plan['replacements']} if replacement_plan else set()
sources=[{'job':job,'base':STATE,'excluded':(job['task'],job['arm']) in replacement_keys,'execution':'original'} for job in manifest['jobs']]
if replacement_plan:
    sources += [{'job':{'task':j['task'],'arm':j['arm']},'base':STATE/'replacements/receipt-permissions-r1',
                 'excluded':False,'execution':'replacement-r1'} for j in replacement_plan['replacements']]
rows=[];excluded=[]
for source in sources:
    job=source['job']
    name=job['task']+'-'+job['arm']
    path=source['base']/'results'/(name+'.json')
    if not path.exists(): continue
    trial=json.loads(path.read_text())
    root=source['base']/'trials'/name/'agent/receipts'
    worker_path=root/'worker.json'
    worker=json.loads(worker_path.read_text()) if worker_path.exists() else {}
    usage=worker.get('usage',{})
    reward=(trial.get('verifier_result') or {}).get('rewards')
    accepted=bool(reward) and all(v==1 for v in reward.values())
    unknown=not worker or usage.get('costUnknown',False) or worker.get('usageCostUnknown',False)
    identity=worker.get('identity')
    requests=[];assistants=[];raw_usage={}
    for p in root.rglob('*.jsonl'):
        if '/events/' not in p.as_posix() and p.name!='events.live.jsonl': continue
        # JSONL is delimited by LF. splitlines() also splits legal JSON string
        # characters such as U+0085/U+2028 from binary-like tool output.
        for line in p.read_text(errors='replace').split('\n'):
            if not line.strip(): continue
            try: event=json.loads(line)
            except json.JSONDecodeError: unknown=True;continue
            if event.get('type')=='provider_request': requests.append({**event,'stage':p.relative_to(root).parts[0]})
            if event.get('type')=='assistant': assistants.append(event)
            if event.get('type')=='provider_usage' and event.get('responseId'): raw_usage[event['responseId']]=event
    if job['arm'] in ['v1','v2','v3']:
        identity=bool(requests)
        for e in requests:
            advisor=e['stage'].startswith('advice-');sol_stage=advisor or e['stage']=='sol-takeover'
            model='gpt-6.1-sol' if job['arm']=='v1' or sol_stage else 'gpt-6-luna'
            effort='low' if job['arm']=='v2' and sol_stage else 'high'
            if job['arm']=='v3':
                model='gpt-6.1-sol' if e['stage']=='coordinate' else 'gpt-6-luna'
                identity=identity and (e['stage']=='coordinate' or e['stage'].startswith('delegate-'))
            identity=identity and e.get('model')==model and (e.get('reasoning') or {}).get('effort')==effort
            identity=identity and e.get('toolNames')==([] if advisor else ['codemode'])
    totals={k:sum((e.get('usage') or {}).get(k,0) for e in assistants) for k in ['input','cacheRead','cacheWrite','output']}
    ledger_cost=sum(((e.get('usage') or {}).get('cost') or {}).get('total',0) for e in assistants)
    if not worker and assistants:
        # This is only a floor: the final in-flight response may be unrecorded.
        usage={**totals,'estimatedApiUsd':ledger_cost,'costUnknown':True}
    matched=bool(assistants) and len(raw_usage)==len(assistants) and abs(ledger_cost-usage.get('estimatedApiUsd',0))<1e-9
    matched=matched and all(totals[k]==usage.get(k,0) for k in totals)
    matched=matched and sum(e['usage'].get('input_tokens',0) for e in raw_usage.values())==sum(totals[k] for k in ['input','cacheRead','cacheWrite'])
    matched=matched and sum(e['usage'].get('output_tokens',0) for e in raw_usage.values())==totals['output']
    if job['arm']=='codex': matched=matched and bool(worker.get('recordsMatchedFinalAggregate'))
    else: matched=matched and len(requests)==len(assistants)
    unknown=unknown or not matched
    phase=trial.get('agent_execution') or {}
    phase_ms=None
    if phase.get('started_at') and phase.get('finished_at'):
        phase_ms=(datetime.fromisoformat(phase['finished_at'])-datetime.fromisoformat(phase['started_at'])).total_seconds()*1000
    responses=worker.get('modelCalls',worker.get('turns',usage.get('modelCalls')))
    calls=worker.get('toolCalls',worker.get('calls',usage.get('toolCalls')))
    eligible=bool(not trial.get('exception_info') and worker.get('status')=='completed' and identity and matched and not unknown
      and usage.get('estimatedApiUsd',0)<=5 and responses is not None and responses<=100
      and calls is not None and calls<=240)
    row={**job,'graded':bool(reward),'accepted':accepted,'policyValidSuccess':accepted and eligible,'officialReward':reward,
      'status':worker.get('status'),'identity':identity,
      'costUnknown':bool(unknown),'knownCostUsd':usage.get('estimatedApiUsd',0),
      'costUsd':None if unknown else usage.get('estimatedApiUsd'),
      'latencyMs':worker.get('latencyMs'),'agentPhaseMs':phase_ms,'usage':usage,
      'modelCalls':responses,'toolCalls':calls,'receiptsMatched':matched,
      'publicVerification':worker.get('verificationStatus'),
      'adviceCalls':worker.get('adviceCalls',0),'repairs':worker.get('repairs',0),
      'takeovers':worker.get('escalations',0),
      'exceptionType':(trial.get('exception_info') or {}).get('exception_type'),
      'agentTiming':trial.get('agent_execution'),'setupTiming':trial.get('agent_setup'),
      'recovery':trial.get('recovery'),
      'trialResultSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
      'workerSha256':hashlib.sha256(worker_path.read_bytes()).hexdigest() if worker_path.exists() else None}
    row['usageSource']='worker aggregate' if worker else 'partial response receipts; whole-attempt cost unknown'
    row['execution']=source['execution']
    row['delegations']=worker.get('delegations',0)
    row['coordinatorCostUsd']=worker.get('coordinatorCostUsd')
    row['workerCostUsd']=worker.get('workerCostUsd')
    row['stages']=[{k:s.get(k) for k in ['label','model','effort','usage','latencyMs','error','includesNestedLatency']} for s in worker.get('stages',[])]
    if source['excluded']:
        row['excludedReason']='User-authorized replacement for receipt permissions failure before grading'
        excluded.append(row)
    else:rows.append(row)
summary=[]
for arm in arms:
    group=[r for r in rows if r['arm']==arm]
    lat=[r['agentPhaseMs']/1000 for r in group if r['agentPhaseMs'] is not None]
    summary.append({'arm':arm,'completed':len(group),'accepted':sum(r['accepted'] for r in group),
      'graded':sum(r['graded'] for r in group),'ungraded':sum(not r['graded'] for r in group),
      'policyValidSuccesses':sum(r['policyValidSuccess'] for r in group),
      'knownCostUsd':sum(r['knownCostUsd'] for r in group),
      'unknownCosts':sum(r['costUnknown'] for r in group),
      'meanSeconds':statistics.mean(lat) if lat else None,
      'adviceCalls':sum(r['adviceCalls'] for r in group),
      'repairs':sum(r['repairs'] for r in group),'takeovers':sum(r['takeovers'] for r in group)})
OUT.mkdir(parents=True,exist_ok=True)
data={'asOf':time.time(),'complete':len(rows)==expected,'attempts':rows,'summary':summary,
      'excludedInfrastructureAttempts':excluded,'completedExecutionsIncludingExcluded':len(rows)+len(excluded),
      'selectedKnownCostUsd':sum(r['knownCostUsd'] for r in rows),
      'excludedKnownCostUsd':sum(r['knownCostUsd'] for r in excluded),
      'totalKnownSpendIncludingExcludedUsd':sum(r['knownCostUsd'] for r in rows+excluded),
      'totalUnknownCostsIncludingExcluded':sum(r['costUnknown'] for r in rows+excluded),
      'replacementPlan':replacement_plan}
(OUT/'results.json').write_text(json.dumps(data,indent=2)+'\n')
lines=['# '+manifest.get('version','HarnessTax Sol 6.1 single round'), '',f'Completed comparison slots: {len(rows)}/{expected}. '+('Final.' if len(rows)==expected else 'Interim; not a final comparison.'),'',
 '| Arm | Completed | Graded | Accepted | Policy valid | Known cost (USD) | Unknown costs | Mean agent seconds |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
if (STATE/'paused-for-quota.json').exists():
    pause=json.loads((STATE/'paused-for-quota.json').read_text())
    lines[2]+=f" Paused at the requested quota floor: {pause['quota']['remainingPercent']}% remaining."
for r in summary:
    seconds='—' if r['meanSeconds'] is None else f"{r['meanSeconds']:.1f}"
    lines.append(f"| {r['arm']} | {r['completed']}/{len(manifest.get('tasks',[])) or 30} | {r['graded']} | {r['accepted']} | {r['policyValidSuccesses']} | {r['knownCostUsd']:.6f} | {r['unknownCosts']} | {seconds} |")
ungraded=[r for r in rows if not r['graded']]
if ungraded:
    lines+=['',f'{len(ungraded)} completed attempts lack official grades. These remain in the campaign denominator but must not be presented as graded patch rejections.']
    lines += [f"- {r['task']} / {r['arm']}: {r['exceptionType'] or 'official reward missing'}" for r in ungraded]
if replacement_plan:
    pending=sum(not (STATE/'replacements/receipt-permissions-r1/results'/(j['task']+'-'+j['arm']+'.json')).exists() for j in replacement_plan['replacements'])
    lines+=['',f'Six infrastructure replacements were authorized before their outcomes. Pending replacements: {pending}.',
        f"Excluded originals: {len(excluded)}; completed executions including excluded: {len(rows)+len(excluded)}.",
        f"Selected comparison known cost: ${data['selectedKnownCostUsd']:.6f}; excluded infrastructure known cost: ${data['excludedKnownCostUsd']:.6f}; total known campaign spend including excluded: ${data['totalKnownSpendIncludingExcludedUsd']:.6f}.",
        'Excluded originals do not count toward comparison accuracy, cost per task, or latency. Their receipts and costs remain in the audit trail and total spend. Replacement failures count; no outcome-based fallback to originals.']
lines+=['','API-equivalent cost estimates, not subscription charges. Unknown costs remain unknown.',
 'An offline accounting audit reconciled all eight financial-document-processor / V1 responses at $0.186490. Its former unknown flag came from splitting JSONL on legal Unicode characters inside tool output; no usage or evaluator score changed. See cost-accounting-audit.json.',
 'Two original costs remain unconfirmed: Codex adaptive-rejection-sampler failed in routing discovery with zero recorded model responses; V1 make-doom-for-mips lost receipts on its early outer timeout. Neither is treated as confirmed zero spend.',
 ('One selected attempt per task/arm. Only the six preselected, ungraded permissions failures are replaced at the user\'s request; all other original failures remain in the comparison.' if replacement_plan else 'One attempt per task/arm; no replacement runs. All errors and failures remain in the denominator.'),
 'Latency is the full Harbor agent phase, including wrapper/runtime startup and receipt export. Worker-only timings are also retained in results.json.',
 'The Pi adaptive-rejection-sampler actor and grader completed before a host interruption during artifact collection. Original receipts were recovered and hash checked against its container; outer phase timing is missing. No actor or grader rerun.',
 'After the first two attempts, concurrency is at most two, with a combined 4 GiB task reservation; tasks above 2 GiB run alone. Shared resources may affect latency.',
 'After attempt 55, actor receipts are bind-mounted to the host so timeout cancellation cannot skip export. Timed-out actors are stopped before grading; timeout failures remain in the denominator and incomplete costs remain unknown. No retries.',
 'A receipt permissions error prevented grading for six V1/V2 attempts. Those originals remain in the audit trail. The adapter now reads private receipts as root inside the container before host ownership cleanup.',
 'V2 changes model as well as pipeline. Codex/Pi/V1 match Sol High; V2 is a system comparison.',
 '100-response cap; first provider-failed attempt had the initial 60 cap but made zero responses.',
 'V2 controller smoke checks cover 3/30 tasks, solely from public instructions. Other tasks have no controller verification trigger.',
 'No private grader feedback is used for Sol escalation. Passing a public smoke check does not establish correctness.',
 'Source and dependency pins, full cohort, limits and preflight are in manifest.json, preflight.json and benchmark/harnesstax-plan.md.',
 'Historical Pi $0.420517/attempt was GPT-5.6-Sol High with three repetitions and is not this run\'s control.',
 '',f"Sol advice calls: {sum(r['adviceCalls'] for r in rows)}; repairs: {sum(r['repairs'] for r in rows)}; takeovers: {sum(r['takeovers'] for r in rows)}."]
if manifest.get('version')=='refinement-pilot-v1':
    lines=lines[:6+len(summary)]+['',
        f"Known campaign spend: ${data['totalKnownSpendIncludingExcludedUsd']:.6f}; incomplete cost records: {data['totalUnknownCostsIncludingExcluded']}.",
        'API-equivalent estimates, not subscription charges. Unknown costs remain unknown.',
        'Five fresh tasks, one attempt per arm. No outcome-selected replacements. All failures and timeouts remain reported.',
        'Pi is stock Sol High; V1 is refined Flexible Sol High; V2 uses Luna High with one upfront Sol Low plan and conditional repair/takeover; V3 uses Sol High coordination and Luna High delegation.',
        'Every arm sees the same original task and public self-check. Only the declared Suffice controller policies use post-implementation public feedback for repair. Hidden evaluator feedback is never sent to an actor.',
        'Public checks are partial coverage, not correctness certificates. Missing checks are unverified. Independent acceptance is reported separately.',
        'All Sol planning, coordination, workers and repairs are included in whole-attempt spend. Stage costs do not overlap. V3 coordinator elapsed time includes worker time and must not be summed with worker elapsed time.',
        'At most two 2 GiB containers run concurrently. Shared host load may affect latency. Mean seconds covers full Harbor agent execution, not setup or official grading.',
        'This small purposive system comparison does not isolate individual features or establish population accuracy. Original campaign results and production defaults remain unchanged.',
        '',f"Upfront/advisory calls: {sum(r['adviceCalls'] for r in rows)}; repair counter: {sum(r['repairs'] for r in rows)}; takeovers: {sum(r['takeovers'] for r in rows)}; V3 delegations: {sum(r['delegations'] for r in rows)}."]
    lines += [f"Ungraded: {r['task']} / {r['arm']}: {r['exceptionType']}" for r in rows if not r['graded']]
(OUT/'RESULTS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'completed':len(rows),'summary':summary}))
