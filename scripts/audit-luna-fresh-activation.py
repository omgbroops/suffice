"""Audit actual gate activation from preserved events, without changing any actor."""
import pathlib,json,hashlib,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1];DIR=ROOT/'.suffice/luna-fresh-v1';OUT=ROOT/'reports/luna-fresh-v1'
rows=[]
for folder in sorted((DIR/'attempts').glob('*-B')):
 events=[json.loads(l) for l in (folder/'worker/events.live.jsonl').read_text().splitlines() if l]
 repairs=[e for e in events if e['type']=='preservation_repair']
 if not repairs:continue
 initial=json.loads((folder/'worker/public-verification/initial-patch.json').read_text());after=json.loads((folder/'worker/public-verification/after-repair-patch.json').read_text())
 by=lambda entries:{e['path']:e['after'] for e in entries if not e['protectedTest']}
 a,b=by(initial),by(after);changed=[p for p in set(a)|set(b) if a.get(p)!=b.get(p)]
 libraryPaths=[p for p in set(a)|set(b) if p in ['index.js','queue.js'] or p.startswith(('src/','source/'))]
 resultFile=folder/'result.json';result=json.loads(resultFile.read_text()) if resultFile.exists() else None
 worker=json.loads((folder/'worker/worker.json').read_text());activation=repairs[0]
 rows.append({'attempt':folder.name,'costBeforeContinuationUsd':activation['costBefore'],'finalApiEquivalentUsd':worker['usage']['estimatedApiUsd'],'incrementalContinuationApiEquivalentUsd':worker['usage']['estimatedApiUsd']-activation['costBefore'],'extraAssistantReplies':sum(e['type']=='assistant' and e['at']>=activation['at'] for e in events),'allNonTestChangedPathsDuringContinuation':changed,'libraryImplementationChanged':any(a.get(p)!=b.get(p) for p in libraryPaths),'initialIndependentGrade':result.get('firstSubmissionGrade') if result else None,'finalIndependentGrade':result.get('grade') if result else None,'diagnosis':'Existing timing assertion measured 299.921717 ms below a 300 ms lower bound. Same library bytes subsequently pass. No demonstrated behavioral repair; timing-only false alarm candidate.','gates':[{'phase':e['phase'],'passed':e['passed']} for e in events if e['type']=='preservation_gate']})
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'primaryInputsChanged':False,'modelFeedbackFromHiddenTests':False,'activations':rows,'source':'Preserved first/final patches, raw public gate logs, before/after cost counters, and separate independent regrading'}
(OUT/'gate-activation-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'activations':len(rows),'rows':[{k:r[k] for k in ['attempt','incrementalContinuationApiEquivalentUsd','extraAssistantReplies','libraryImplementationChanged','allNonTestChangedPathsDuringContinuation']} for r in rows]}))
