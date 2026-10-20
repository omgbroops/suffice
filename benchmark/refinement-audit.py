"""Offline activation/accounting audit. Reads completed actor receipts only."""
import hashlib
import json
from pathlib import Path

STATE=Path('/home/eric_qin/suffice-refinement-pilot')
OUT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice/reports/refinement-pilot-v1')

def main():
    audited=[]
    for result in sorted((STATE/'results').glob('*.json')):
        root=STATE/'trials'/result.stem/'agent/receipts'
        if not (root/'worker.json').exists():continue
        worker=json.loads((root/'worker.json').read_text())
        if worker.get('strategy') not in ['efficient','orchestrated']:continue
        events=[]
        files=[p for p in root.rglob('*.jsonl') if '/events/' in p.as_posix()]
        for p in files:
            events += [{**json.loads(line),'stage':p.relative_to(root).parts[0]} for line in p.read_text().split('\n') if line.strip()]
        assistants=[e for e in events if e.get('type')=='assistant']
        cost=sum(e.get('usage',{}).get('cost',{}).get('total',0) for e in assistants)
        stage_cost=sum(s['usage']['estimatedApiUsd'] for s in worker.get('stages',[]))
        matched=abs(cost-worker['usage']['estimatedApiUsd'])<1e-9 and abs(stage_cost-cost)<1e-9
        coordinator_tools=sorted({e['name'] for e in events if e.get('type')=='tool_call' and e['stage']=='coordinate'})
        assert not set(coordinator_tools)&{'bash','write','edit'}, 'Coordinator attempted an implementation tool'
        requests=[e for e in events if e.get('type')=='provider_request']
        roles={}
        for e in requests:
            role=roles.setdefault(e['stage'],{'model':e['model'],'effort':e.get('reasoning',{}).get('effort'),'requests':0})
            assert role['model']==e['model'];role['requests']+=1
        for name,role in roles.items():
            messages=[e.get('usage',{}) for e in assistants if e['stage']==name]
            role['responses']=len(messages)
            role['tokens']={k:sum(u.get(k,0) for u in messages) for k in ['input','cacheRead','cacheWrite','output']}
            role['peakContextTokens']=max((sum(u.get(k,0) for k in ['input','cacheRead','cacheWrite']) for u in messages),default=0)
            role['knownCostUsd']=sum(u.get('cost',{}).get('total',0) for u in messages)
        audited.append({'attempt':result.stem,'strategy':worker['strategy'],'roles':roles,
            'adviceCalls':worker.get('adviceCalls',0),'delegations':worker.get('delegations',0),
            'coordinatorToolCalls':coordinator_tools,'knownCostUsd':worker['usage']['estimatedApiUsd'],
            'stageAndLedgerCostMatch':matched,'costUnknown':worker['usage'].get('costUnknown',False),
            'workerSha256':hashlib.sha256((root/'worker.json').read_bytes()).hexdigest()})
    (OUT/'activation-audit.json').write_text(json.dumps({'scope':'Completed actor receipts only; no evaluator feedback or actor mutation.','attempts':audited},indent=2)+'\n')
    print(json.dumps({'audited':len(audited),'matched':sum(r['stageAndLedgerCostMatch'] for r in audited)}))
if __name__=='__main__':main()
