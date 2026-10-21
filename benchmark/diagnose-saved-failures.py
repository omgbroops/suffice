"""Offline actor-evidence inventory. Never opens verifier/test/solution files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = Path(r'\\wsl.localhost\Ubuntu\home\eric_qin')
OUT = ROOT/'reports/post-review-v1'
COHORTS = [('harnesstax-sol61-v1','suffice-harnesstax-sol61'),
           ('refinement-pilot-v1','suffice-refinement-pilot'),('calibration-v1','suffice-calibration-v1')]


def main():
    rows=[]
    for cohort,state in COHORTS:
        data=json.loads((ROOT/'reports'/cohort/'results.json').read_text())
        for excluded,attempts in [(False,data['attempts']),(True,data['excludedInfrastructureAttempts'])]:
            for a in attempts:
                if a['accepted']:continue
                name=a['task']+'-'+a['arm']
                candidates=[STATE/state/a.get('receiptStateRelative','')/'trials'/name/'agent/receipts']
                if excluded:candidates=[STATE/state/'trials'/name/'agent/receipts']
                elif cohort=='harnesstax-sol61-v1' and a.get('execution')!='original':
                    candidates=list((STATE/state/'replacements').glob('*/trials/'+name+'/agent/receipts'))
                receipt=next((p for p in candidates if (p/'worker.json').exists()),None)
                worker=json.loads((receipt/'worker.json').read_text(encoding='utf8')) if receipt else {}
                final=worker.get('final',''); evidence=[]; messages=[]; tool_errors=0
                if receipt:
                    paths=[receipt/'worker.json']
                    paths += [p for p in receipt.rglob('*.jsonl') if p.name in ('pi-events.jsonl','native-events.jsonl') or 'events' in p.parts]
                    for p in paths:
                        evidence.append({'path':str(p.relative_to(STATE)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
                        if p.suffix!='.jsonl':continue
                        for line in p.read_text(encoding='utf8').split('\n'):
                            if not line.strip():continue
                            e=json.loads(line)
                            if e.get('type')=='tool_result' and e.get('isError'):tool_errors+=1
                            m=e.get('message',{})
                            if not isinstance(m,dict):m={}
                            if m.get('role')=='assistant':
                                text=''.join(c.get('text','') for c in m.get('content',[]) if c.get('type')=='text')
                                if text:messages.append(text)
                            item=e.get('item',{})
                            if e.get('type')=='item.completed' and item.get('type')=='agent_message':messages.append(item.get('text',''))
                    if not final and messages:final=messages[-1]
                classes=[]
                def mark(category,confidence,basis):classes.append(dict(category=category,confidence=confidence,basis=basis))
                if a.get('exceptionType') in ('VerifierTimeoutError','PermissionError'):
                    mark('grading problems','observed',a['exceptionType']+'; no private grading content inspected')
                if a.get('status') in ('provider_error','cost_unknown'):
                    mark('provider failures','observed operational signal','Provider/usage interruption; exact transport cause may remain unresolved')
                if a.get('exceptionType')=='AgentTimeoutError':
                    mark('reasoning','unresolved','Actor deadline exceeded with missing terminal receipt; no reasoning cause established')
                if a.get('publicVerification')=='passed' and a.get('graded') and not a['accepted']:
                    mark('verification gaps','observed','Public pass followed by independent non-acceptance; cause of discrepancy is not inferred')
                if a.get('publicVerification')=='not_configured':
                    mark('verification gaps','observed','No controller verification configured; worker checks, if any, are only self-reported here')
                lower=final.lower()
                if 'restrictions' in lower and a['task'] in ('nginx-request-logging','configure-git-webserver'):
                    mark('tool/scope issues','supported by actor admission','Repository restriction left requested system installation/state pending')
                    mark('misunderstood requirements','supported by actor admission','Delivered instructions or temporary state instead of completing requested installed state')
                if cohort=='refinement-pilot-v1' and a['task']=='polyglot-c-py':
                    mark('tool/scope issues','observed public evidence','Missing system python3 in fixed invocation; command-local PATH differs from controller environment')
                    mark('verification gaps','observed','Unavailable prerequisite funded repair; 38-case public artifact replay passes without changing official outcome')
                if a['task']=='financial-document-processor' and a['arm']=='v2':
                    mark('tool/scope issues','actor admission','PDF extraction utility unavailable; six PDFs not inspected')
                    mark('misunderstood requirements','incomplete fulfillment admitted','Uninspected PDFs classified without content-based evidence')
                if a['task'] in ('path-tracing','path-tracing-reverse','make-doom-for-mips','build-cython-ext') and a['arm']=='v2':
                    mark('reasoning','supported incompleteness, cause uncertain','Actor reports approximation, failed runtime, or remaining test failure; does not establish underlying cognitive cause')
                if a['task']=='db-wal-recovery' and a['arm']=='v2-concise':
                    mark('reasoning','actor admission','WAL lost after SQLite access; missing rows filled by inference rather than recovered evidence')
                    mark('verification gaps','observed','Visible check accepted inferred data despite admitted incomplete recovery')
                if not any(c['category']=='reasoning' for c in classes) and a.get('graded'):
                    mark('reasoning','unresolved','Independent rejection does not identify a reasoning defect; exact candidate failure remains unestablished')
                rows.append({'cohort':cohort,'task':a['task'],'arm':a['arm'],'excludedOriginal':excluded,
                    'officialGraded':a['graded'],'publicVerification':a.get('publicVerification'),
                    'status':a.get('status'),'classifications':classes,'actorFinal':final,
                    'recordedToolErrorCount':tool_errors,'evidence':evidence,'missingWorker':not bool(receipt)})
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'failure-inventory.json').write_text(json.dumps({'scope':'Offline actor traces and public outcome metadata only; never runtime guidance',
        'classificationMethod':'Non-exclusive mechanism labels; unresolved causes explicitly retained; final statements are actor claims, not verified facts',
        'attempts':rows},indent=2)+'\n',encoding='utf8')
    print(json.dumps({'reviewedUnsuccessfulRecords':len(rows),'missingWorkers':sum(r['missingWorker'] for r in rows),
        'categoryAttemptCounts':{c:sum(any(x['category']==c for x in r['classifications']) for r in rows) for c in
        ['reasoning','misunderstood requirements','verification gaps','tool/scope issues','provider failures','grading problems']}}))


if __name__=='__main__':main()
