"""Reconstruct final source from actor-only receipts. Never read evaluator files."""
import hashlib
import json
import os
from pathlib import Path

STATE=Path(os.environ.get('REFINEMENT_STATE',r'\\wsl.localhost\Ubuntu\home\eric_qin\suffice-refinement-pilot'))
OUT=Path(os.environ.get('CALIBRATION_AUDIT_OUT',r'\\wsl.localhost\Ubuntu\home\eric_qin\suffice-calibration-v1/artifact-audit'))

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    records=[]
    for arm in ['pi','v1','v2','v3']:
        root=STATE/f'trials/polyglot-c-py-{arm}/agent/receipts'
        paths=[root/'events.live.jsonl'] if arm=='pi' else [p for p in root.rglob('*.jsonl') if 'events' in p.parts]
        events=[]
        for p in paths:
            events.extend(json.loads(line) for line in p.read_text(encoding='utf-8').split('\n') if line.strip())
        events.sort(key=lambda e:e.get('at',''))
        source=None;history=[]
        for e in events:
            if e.get('type')!='tool_call':continue
            inp=e.get('input',{})
            if not inp.get('path','').endswith('polyglot/main.py.c'):continue
            if e['name']=='write':source=inp['content']
            elif e['name']=='edit':
                assert source is not None
                for edit in inp.get('edits',[inp]):
                    old,new=edit['oldText'],edit['newText']
                    assert source.count(old)==1,(arm,old,source.count(old))
                    source=source.replace(old,new,1)
            else:continue
            history.append({'tool':e['name'],'sha256':hashlib.sha256(source.encode()).hexdigest()})
        assert source is not None
        dest=OUT/arm/'main.py.c';dest.parent.mkdir(exist_ok=True)
        dest.write_bytes(source.encode())
        records.append({'arm':arm,'sourceSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'history':history})
    (OUT/'source-provenance.json').write_text(json.dumps({'scope':'Actor tool receipts only; no hidden tests or solutions. Successful replay still covers public cases only.','artifacts':records},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'reconstructed':len(records),'out':str(OUT)}))
if __name__=='__main__':main()
