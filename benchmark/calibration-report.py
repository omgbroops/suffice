"""Offline paired calibration analysis. Never modifies actors or reads private tests."""
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
STATE=Path(os.environ.get('HARNESS_TAX_REPORT_STATE',r'\\wsl.localhost\Ubuntu\home\eric_qin\suffice-calibration-v1' if os.name=='nt' else '/home/eric_qin/suffice-calibration-v1'))
OUT=Path(os.environ.get('HARNESS_TAX_REPORT_OUT',str(ROOT/'reports/calibration-v1')))

def main():
    env={**os.environ,'HARNESS_TAX_REPORT_STATE':str(STATE),'HARNESS_TAX_REPORT_OUT':str(OUT)}
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'benchmark/harnesstax-report.py')],env=env,check=True,stdout=subprocess.DEVNULL)
    data=json.loads((OUT/'results.json').read_text());rows=data['attempts'];manifest=json.loads((STATE/'manifest.json').read_text())
    metrics=[]
    for row in rows:
        root=STATE/row.get('receiptStateRelative','')/'trials'/(row['task']+'-'+row['arm'])/'agent/receipts';events=[]
        for path in root.rglob('*.jsonl'):
            if 'events' not in path.parts and path.name!='events.live.jsonl':continue
            for line in path.read_text(encoding='utf-8').split('\n'):
                if not line.strip():continue
                try:events.append(json.loads(line))
                except json.JSONDecodeError:pass # Aggregate report already marks malformed/incomplete receipts unknown.
        assistants=[e for e in events if e.get('type')=='assistant']
        raw={e['responseId']:e['usage'] for e in events if e.get('type')=='provider_usage' and e.get('responseId')}
        worker=json.loads((root/'worker.json').read_text()) if (root/'worker.json').exists() else {}
        # Pi observer omits assistant content; its stock JSON stream retains it.
        if row['arm']=='pi' and (root/'pi-events.jsonl').exists():
            assistants=[]
            for line in (root/'pi-events.jsonl').read_text(encoding='utf-8').split('\n'):
                if not line.strip():continue
                try:e=json.loads(line)
                except json.JSONDecodeError:continue
                if e.get('type')=='message_end' and e.get('message',{}).get('role')=='assistant':assistants.append(e['message'])
        blocks=[b for e in assistants for b in e.get('content',[]) if isinstance(b,dict)]
        metrics.append({'task':row['task'],'arm':row['arm'],'visibleTextChars':sum(len(b.get('text','')) for b in blocks if b.get('type')=='text'),
            'thinkingChars':sum(len(b.get('thinking','')) for b in blocks if b.get('type')=='thinking'),
            'reasoningTokens':sum(u['output_tokens_details']['reasoning_tokens'] for u in raw.values()) if raw and all('reasoning_tokens' in u.get('output_tokens_details',{}) for u in raw.values()) else None,
            'rawUsageResponses':len(raw),'communication':(manifest['policies'][row['arm']].get('execution') or {}).get('communication','default'),
            'stageCostMatch':abs(sum((s.get('usage') or {}).get('estimatedApiUsd',0) for s in worker.get('stages',[]))-row['knownCostUsd'])<1e-9 if row['arm']!='pi' else None})
    (OUT/'communication-metrics.json').write_text(json.dumps({'attempts':metrics},indent=2)+'\n',encoding='utf-8')
    lines=['# Calibration analysis','',f"Completed: {len(rows)}/32. "+('Final.' if data['complete'] else 'Interim; compare only matched completed pairs.'),'',
        '| Arm | Accepted / completed | Known USD | USD / accepted | Mean seconds | Output tokens | Visible text chars | Sol calls | Repairs | Takeovers |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for arm in manifest['arms']:
        group=[r for r in rows if r['arm']==arm];accepted=sum(r['accepted'] for r in group);cost=sum(r['knownCostUsd'] for r in group)
        times=[r['agentPhaseMs']/1000 for r in group if r['agentPhaseMs'] is not None];unknown=any(r['costUnknown'] for r in group)
        per=f'{cost/accepted:.6f}' if accepted else 'undefined'
        lines.append(f"| {arm} | {accepted}/{len(group)} | {'≥' if unknown else ''}{cost:.6f} | {'≥' if unknown and accepted else ''}{per} | {statistics.mean(times):.1f} | {sum(r['usage'].get('output',0) for r in group)} | {sum(m['visibleTextChars'] for m in metrics if m['arm']==arm)} | {sum(r['adviceCalls'] for r in group)} | {sum(r['repairs'] for r in group)} | {sum(r['takeovers'] for r in group)} |" if times else f'| {arm} | 0/0 | 0 | undefined | unavailable | 0 | 0 | 0 | 0 | 0 |')
    lines+=['','## Matched comparisons','', 'Task order and arm policies were frozen before inference. Every selected failed attempt remains in cost denominators. User-authorized provider-interruption originals are excluded separately. Partial or unknown costs are floors.']
    for control,treatment in [('pi','v1-original'),('v1-original','v1-refined'),('v1-refined','v1-concise'),('v2-alone','v2-upfront'),('v2-alone','v2-selective'),('v2-upfront','v2-selective'),('v2-selective','v2-concise')]:
        a={r['task']:r for r in rows if r['arm']==control};b={r['task']:r for r in rows if r['arm']==treatment};keys=sorted(a.keys()&b.keys())
        if not keys:continue
        wins=[k for k in keys if b[k]['accepted'] and not a[k]['accepted']];losses=[k for k in keys if a[k]['accepted'] and not b[k]['accepted']]
        cost_a=sum(a[k]['knownCostUsd'] for k in keys);cost_b=sum(b[k]['knownCostUsd'] for k in keys)
        lines+=['',f'{treatment} versus {control}: {len(keys)} matched tasks, known cost floors ${cost_b:.6f} versus ${cost_a:.6f}; accepted-outcome wins (including infrastructure effects): {", ".join(wins) or "none"}; regressions: {", ".join(losses) or "none"}.']
        clean=[k for k in keys if all(r['graded'] and r['identity'] and not r['costUnknown'] and r['receiptsMatched'] for r in [a[k],b[k]])]
        lines.append(f'Fully accounted matched pairs: {len(clean)}/{len(keys)}; costs ${sum(b[k]["knownCostUsd"] for k in clean):.6f} versus ${sum(a[k]["knownCostUsd"] for k in clean):.6f}. Excluded from this accounting-only comparison: {", ".join(k for k in keys if k not in clean) or "none"}. All outcomes remain in the table and overall denominator.')
        if clean:
            ca=sum(a[k]['knownCostUsd'] for k in clean);cb=sum(b[k]['knownCostUsd'] for k in clean)
            timed=[k for k in clean if a[k]['agentPhaseMs'] is not None and b[k]['agentPhaseMs'] is not None]
            ta=sum(a[k]['agentPhaseMs'] for k in timed);tb=sum(b[k]['agentPhaseMs'] for k in timed)
            lines.append(f'On these accounting pairs, cost change: {(cb/ca-1)*100:+.2f}%; '+(f'wall-time change across {len(timed)} timed pairs: {(tb/ta-1)*100:+.2f}%.' if ta else 'wall-time change unavailable.')+' These are observed changes, with shared-host and provider contention.')
    lines+=['','## Verification gaps','',
        'Independent grades are observed only after actor shutdown and never fed into routing. A passed partial public check can therefore leave a real defect undetected. This is a coverage limit, not evidence that assistance was unnecessary.',
        '', '| Arm | Independent failures after public pass | Public failures | Unavailable / not run |', '| --- | ---: | ---: | ---: |']
    for arm in manifest['arms']:
        group=[r for r in rows if r['arm']==arm]
        gaps=sum(r['graded'] and not r['accepted'] and r['publicVerification']=='passed' for r in group)
        lines.append(f"| {arm} | {gaps} | {sum(r['publicVerification']=='failed' for r in group)} | {sum(r['publicVerification'] in ['unavailable','not_run'] for r in group)} |")
    lines+=['','## Every outcome','', '| Task | Arm | Independent grade | Public verification | Status | Known USD |', '| --- | --- | --- | --- | --- | ---: |']
    for r in rows:lines.append(f"| {r['task']} | {r['arm']} | {'ungraded' if not r['graded'] else 'pass' if r['accepted'] else 'fail'} | {r['publicVerification']} | {r['status']} | {'≥' if r['costUnknown'] else ''}{r['knownCostUsd']:.6f} |")
    lines+=['','API-equivalent estimates, not subscription charges. Full stage costs, cache tokens, calls, identity and receipt reconciliation are in results.json. Visible text is measured in characters, not billed tokens; reasoning and tool arguments can dominate output cost.',
        'Four purposively chosen tasks and one attempt per configuration cannot establish population accuracy or robust causal gains. V1 scope and repair are a bundle; V2 assistance arms compare routing policies with the rest of the core held fixed. Concise changes instructions only.',
        'At most four containers share the host; observed-memory admission may reduce overlap. Shared CPU, network, caching and grading contention limit latency comparisons. No JS/TS source task measures the AST-navigation advantage.',
        'Required product state is not classified as an optional prerequisite. Missing checker infrastructure remains unverified, never accepted by the controller. Independent grading remains separate and cannot trigger assistance.',
        'No global skills, arbitrary compaction or default changes. Original campaign reports and runtime receipts remain preserved.']
    if data.get('replacementPlan'):
        lines+=['','## Provider-interruption replacement amendment','',
            'The user explicitly requested one fresh replacement for each of two interrupted refined-V1 attempts, before replacement outcomes. Those originals are removed from the main comparison, including its costs and latency. Each replacement counts regardless of outcome; there is no fallback to an original or repeat-until-pass.',
            f"Selected comparison known cost: ${data['selectedKnownCostUsd']:.8f}. Excluded originals known cost floor: ${data['excludedKnownCostUsd']:.8f}. Total actual campaign usage floor: ${data['totalKnownSpendIncludingExcludedUsd']:.8f}, with {data['totalUnknownCostsIncludingExcluded']} incomplete costs.",
            'All excluded receipts remain listed in results.json. The frozen runtime, task requirements, public checks, models and effort are unchanged. Later retries and differing service conditions further limit causal comparisons.']
    if (STATE/'admission-amendment.json').exists():
        amendment=json.loads((STATE/'admission-amendment.json').read_text())
        lines+=['','## Admission amendment','',amendment['reason'],'Completed attempts, including the capacity-affected rejection and incomplete cost, are preserved. Only untouched pending jobs resume at two-way concurrency. The frozen actor runtimes, task limits, prompts, checks and policies are unchanged. Mixed concurrency further limits latency attribution.']
    (OUT/'ANALYSIS.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({'completed':len(rows),'summary':data['summary']}))
if __name__=='__main__':main()
