"""Independent event-based accounting; no model calls or actor feedback."""
import pathlib,json,hashlib,datetime
ROOT=pathlib.Path(__file__).resolve().parents[2];HERE=pathlib.Path(__file__).resolve().parent;STATE=ROOT/'.suffice/luna-safeguards-v1';OUT=ROOT/'reports/luna-safeguards-v1';OUT.mkdir(parents=True,exist_ok=True)
def load(p):return json.loads(p.read_text(encoding='utf8'))
plan=load(HERE/'plan.json');rows=[]
for cell in plan['order']:
 run=STATE/'attempts'/(cell['task']+'-'+cell['arm']);events=[json.loads(x) for x in (run/'worker/events.live.jsonl').read_text(encoding='utf8').splitlines() if x.strip()] if (run/'worker/events.live.jsonl').exists() else []
 replies=[e for e in events if e['type']=='assistant'];requests=[e for e in events if e['type']=='provider_request'];raw={e['responseId']:e for e in events if e['type']=='provider_usage'}
 result=load(run/'result.json') if (run/'result.json').exists() else None
 known=sum(e.get('usage',{}).get('cost',{}).get('total',0) or 0 for e in replies)
 summary=next((e for e in reversed(events) if e['type']=='safeguard_summary'),{})
 row={**cell,'effort':plan['arms'][cell['arm']]['effort'],'safeguards':plan['arms'][cell['arm']]['safeguards'],'status':result['status'] if result else 'partial' if run.exists() else 'not_started','accepted':result['accepted'] if result else None,'budgetEligible':result['budgetEligible'] if result else False,'success':result['success'] if result else False,'knownEstimatedUsd':known,'totalEstimatedUsd':result['totalEstimatedUsd'] if result else (None if requests else 0),'requests':len(requests),'replies':len(replies),'rawResponses':len(raw),'matched':result['receiptsMatched'] if result else None,'identity':result['identity'] if result else None,'tools':result['tools'] if result else None,'turns':len(replies),'calls':result['calls'] if result else sum(e['type']=='tool_call' for e in events),'primitiveCalls':sum(e['type']=='tool_call' and e['name']!='codemode' for e in events),'latencyMs':result['latencyMs'] if result else None,'repairs':sum(e['type']=='safeguard_repair_continuation' for e in events),'observedPreEditProbes':summary.get('observedPreEditProbes',0),'publicGateCommands':summary.get('gateCommands',0),'gates':result.get('publicGates',[]) if result else [],'nativeValid':result['grade']['originalNativeValid'] if result else None,'acceptanceExits':[x['exitCode'] for x in result['grade']['acceptance']] if result else [],'patchPaths':result['patchPaths'] if result else [],'knownCostMatchesResult':not result or abs(known-result['knownEstimatedUsd'])<1e-10}
 rows.append(row)
 if result:row['firstSubmissionAccepted']=result.get('firstSubmissionGrade',{}).get('accepted') if result.get('firstSubmissionGrade') else None
manifest=load(STATE/'manifest.json') if (STATE/'manifest.json').exists() else None
drift=[p for p,h in manifest['inputs'].items() if hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()!=h] if manifest else ['not_initialized']
variants={}
for arm in plan['arms']:
 m=load(HERE/'variants'/arm/'source-manifest.json');bad=[]
 for rel,e in m['inputs'].items():
  p=HERE/'variants'/arm/'runtime-source'/rel
  if hashlib.sha256(p.read_bytes()).hexdigest()!=e['variantSha256']:bad.append(rel)
 variants[arm]={'files':len(m['inputs']),'mismatches':bad}
by={}
for arm in plan['arms']:
 a=[r for r in rows if r['arm']==arm];accepted=sum(r['accepted'] is True for r in a);known=sum(r['knownEstimatedUsd'] for r in a);unknown=[r['task'] for r in a if r['totalEstimatedUsd'] is None]
 by[arm]={'attempted':sum(r['status']!='not_started' for r in a),'completed':sum(r['accepted'] is not None for r in a),'accepted':accepted,'budgetEligibleAccepted':sum(r['success'] for r in a),'knownEstimatedUsd':known,'totalEstimatedUsd':None if unknown else known,'unknownCostTasks':unknown,'knownCostPerAccepted':known/accepted if accepted else None,'turns':sum(r['turns'] for r in a),'repairs':sum(r['repairs'] for r in a),'observedPreEditProbes':sum(r['observedPreEditProbes']>0 for r in a),'publicGateCommands':sum(r['publicGateCommands'] for r in a)}
 by[arm]['independentRepairRescues']=sum(r.get('firstSubmissionAccepted') is False and r['accepted'] is True for r in a)
 by[arm]['independentRepairRegressions']=sum(r.get('firstSubmissionAccepted') is True and r['accepted'] is False for r in a)
audit={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':plan,'rows':rows,'byArm':by,'completed':sum(r['accepted'] is not None for r in rows),'knownEstimatedUsd':sum(r['knownEstimatedUsd'] for r in rows),'unknownCostCells':[r['task']+'-'+r['arm'] for r in rows if r['totalEstimatedUsd'] is None],'frozenInputDrift':drift,'variantChecks':variants,'driver':load(STATE/'driver-state.json') if (STATE/'driver-state.json').exists() else None,'limitations':['Development reuse of original ten issues; not heldout.','One new observation per task/arm, repository correlation and possible training exposure.','B bundles three changes; activation does not identify causal component effects.','Public check/probe correctness requires review; passing it is not hidden acceptance.','Frozen grader limitations and native timing sensitivity from original experiment still apply.','Controls are reused exact-source receipts, not newly executed controls.','Engineering inference and preparation overhead excluded; API-equivalent estimates are not actual subscription charges.']}
(OUT/'audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
lines=['# Luna-low safeguards versus Luna-xhigh','',f"Completed {audit['completed']}/30 declared attempts. Known actor inference ${audit['knownEstimatedUsd']:.6f}; unknown-cost cells: {len(audit['unknownCostCells'])}.",'','A = unchanged Luna-low; B = Luna-low plus public verification/preservation/pre-edit probe; C = unchanged Luna-xhigh.','', '| Arm | Accepted | Budget-eligible | Known inference | Unknown totals | Model replies | Repairs | Pre-edit probes observed |','|---|---:|---:|---:|---:|---:|---:|---:|']
for arm,a in by.items():lines.append(f"| {arm} | {a['accepted']}/{a['completed']} | {a['budgetEligibleAccepted']} | ${a['knownEstimatedUsd']:.6f} | {len(a['unknownCostTasks'])} | {a['turns']} | {a['repairs']} | {a['observedPreEditProbes']} |")
lines+=['','| Task | Arm | Status | Accepted | API-equivalent USD | Replies | Public gate outcomes |','|---|---|---|---:|---:|---:|---|']
for r in rows:lines.append(f"| {r['task']} | {r['arm']} | {r['status']} | {r['accepted']} | {r['knownEstimatedUsd']:.6f}{' lower bound' if r['totalEstimatedUsd'] is None else ''} | {r['turns']} | {', '.join(g['phase']+':'+str(g['passed']) for g in r['gates'])} |")
lines+=['']+audit['limitations']+['',f"Frozen input mismatches: {drift}. Variant hash mismatches: { {a:v['mismatches'] for a,v in variants.items()} }.",'','All initial/final patches, public gate output, raw usage, failed responses, actor test edits and independent original/native/private grading are retained. No promotion or further campaign follows automatically.']
(OUT/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print(json.dumps({'completed':audit['completed'],'byArm':by,'knownEstimatedUsd':audit['knownEstimatedUsd'],'drift':drift}))
