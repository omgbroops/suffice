"""Summarize a completed frozen pilot; never supplies feedback to actors."""
import json
from pathlib import Path
import statistics

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/refinement-pilot-v1'

def main():
    data=json.loads((OUT/'results.json').read_text())
    if not data['complete']:raise RuntimeError('Finish the frozen cohort before writing the assessment')
    rows=data['attempts'];arms=['pi','v1','v2','v3']
    lines=['# Five-task refinement pilot assessment','',
        'One attempt per task/arm on five purposively selected fresh tasks. These are system comparisons, not feature ablations or reliable population accuracy estimates. No previous result is replaced.','',
        '| Arm | Accepted | Graded | Known total USD | Known cost / accepted | Mean agent seconds | Incomplete costs |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
    for arm in arms:
        group=[r for r in rows if r['arm']==arm];accepted=sum(r['accepted'] for r in group)
        cost=sum(r['knownCostUsd'] for r in group);unknown=sum(r['costUnknown'] for r in group)
        latency=[r['agentPhaseMs']/1000 for r in group if r['agentPhaseMs'] is not None]
        per=f'{cost/accepted:.6f}' if accepted else 'undefined (no accepted tasks)'
        lines.append(f"| {arm} | {accepted}/5 | {sum(r['graded'] for r in group)} | {'≥' if unknown else ''}{cost:.6f} | {'≥' if unknown and accepted else ''}{per} | {statistics.mean(latency):.1f} | {unknown} |")
    lines+=['','All known costs include failures, planning, delegation and repairs. These are API-equivalent estimates, not subscription charges. Incomplete accounting is retained as a floor, never silently zeroed.','',
        '| Task | Pi | V1 | V2 | V3 |','| --- | --- | --- | --- | --- |']
    for task in dict.fromkeys(r['task'] for r in rows):
        group={r['arm']:r for r in rows if r['task']==task}
        label=lambda r:'ungraded' if not r['graded'] else 'pass' if r['accepted'] else 'fail'
        lines.append('| '+task+' | '+' | '.join(label(group[a]) for a in arms)+' |')
    lines+=['','## Assistance and delegation','']
    for arm in ['v2','v3']:
        group=[r for r in rows if r['arm']==arm]
        lines.append(f"{arm}: {sum(r['adviceCalls'] for r in group)} advisory/planning stages; {sum(r['repairs'] for r in group)} repair counter; {sum(r['takeovers'] for r in group)} takeovers; {sum(r['delegations'] for r in group)} delegations.")
        for model in ['gpt-6.1-sol','gpt-6-luna']:
            stages=[s for r in group for s in r['stages'] if s['model']==model]
            value=sum((s.get('usage') or {}).get('estimatedApiUsd',0) for s in stages)
            lines.append(f'- {model}: known stage cost ${value:.6f}.')
    lines+=['','## Regressions against the same-task Pi control','']
    control={r['task']:r for r in rows if r['arm']=='pi'}
    for arm in arms[1:]:
        group=[r for r in rows if r['arm']==arm]
        misses=[r['task'] for r in group if control[r['task']]['accepted'] and r['graded'] and not r['accepted']]
        wins=[r['task'] for r in group if r['accepted'] and control[r['task']]['graded'] and not control[r['task']]['accepted']]
        lines.append(f"{arm}: Pi-only successes: {', '.join(misses) or 'none'}; arm-only successes: {', '.join(wins) or 'none'}.")
    lines+=['','## Interpretation limits','',
        'Every arm receives the original task and identical visible public check command. Suffice controller feedback/repair is an explicit treatment; Pi receives no extra post-completion model turn. A public check pass covers only its published assertions.',
        'V1 changes scope guidance and public repair. V2 additionally changes model, preparation/output behavior and upfront planning. V3 changes orchestration and the model mix. This run cannot attribute a difference to any single component.',
        'Four sequential V3 delegations are allowed. Only Luna has implementation/shell tools; Sol can inspect source and fixed verification evidence and retrieve original worker output. Worker summaries alone are not accepted as verification.',
        'One shared budget per attempt includes all stages. Parent V3 elapsed time contains nested worker time; stage elapsed times must not be added. At most two task containers share this host, so latency can include resource contention.',
        'No production defaults were changed. Select a follow-up on fresh tasks based on failure mechanisms and cost per accepted task; do not promote an experimental mode solely from five outcomes.']
    (OUT/'ASSESSMENT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('\n'.join(lines[:10]))
if __name__=='__main__':main()
