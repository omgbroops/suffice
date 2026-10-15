import pathlib,json,re,shutil,subprocess,hashlib
R=pathlib.Path('C:/Users/Mohammed/Documents/GitHub/suffice-experiments/field-campaign-v1');P=R/'research/field-campaign-v1/state';T=R/'.suffice/field-campaign-v1/tasks'
reasons={'s01':'Asynchronous subclass emit overrides interact with meta-event authorization, listener lifecycle, concurrent operations, and independent emitters. Requires maintaining reserved-event behavior while delivering add/remove metadata.','s02':'Computed values are cached using dependency arguments and epochs, while cleanup crosses computed, atom, and lifecycle modules. Requires invalidating derived state across unmount and later subscription.','s03':'Whole-store updates to deep maps must propagate through path-aware listeners while preserving ordinary map key semantics and unchanged-path filtering; spans listen-keys and deep-map path APIs.'}
for tid in ['s01','s02','s03']:
 p=P/tid; base=T/tid/'base';f=json.loads((p/'fix-commit.json').read_text(encoding='utf-8'));i=json.loads((p/'original-issue.json').read_text(encoding='utf-8')); dep=T/('s01' if tid=='s01' else 's02')/'dependencies'
 hidden=p/'hidden';hidden.mkdir(exist_ok=True)
 prod=[]; overlay=[]
 for item in f['files']:
  name=item['filename']
  if name.endswith('.js') and not name.startswith('test/'):
   prod.append({'source':str(p/'overlay'/name),'target':name})
 if tid=='s01':
  content=(p/'overlay/test/index.js').read_text(encoding='utf-8'); blocks=[]
  for m in re.finditer(r"^test(?:\.serial)?\('([^']+)'",content,re.M):
   start=m.start();end=content.find('\n});',start)+4
   title=m.group(1)
   if title.startswith('meta event -') and any(s in title for s in ['works with async emit override','listenerRemoved works with async','concurrent on()','onAny() works','offAny() works','multiple emitters have independent']):blocks.append(content[start:end])
  text="import test from 'ava';\nimport delay from 'delay';\nimport Emittery from '../index.js';\n\n"+'\n\n'.join(blocks)+'\n'
  target='test/field-regression.js';hf=hidden/'field-regression.js';hf.write_text(text,encoding='utf-8')
  native=[['node','node_modules/ava/entrypoints/cli.mjs','test/index.js']];accept=[['node','node_modules/ava/entrypoints/cli.mjs',target]]
 elif tid=='s02':
  content=(p/'overlay/clean-stores/index.test.ts').read_text(encoding='utf-8');start=content.index("test('resets computed cache'");end=content.index('\n})',start)+3
  text="import { equal } from 'node:assert'\nimport { test } from 'node:test'\nimport { atom, computed, cleanStores } from '../index.js'\nprocess.env.NODE_ENV = 'test'\n\n"+content[start:end]+'\n';target='clean-stores/field-regression.test.ts';hf=hidden/'field-regression.test.ts';hf.write_text(text,encoding='utf-8')
  native=[['node','--test',*[x.relative_to(base).as_posix() for x in sorted(base.rglob('*.test.ts'))]]];accept=[['node','--test',target]]
 else:
  content=(p/'overlay/listen-keys/index.test.ts').read_text(encoding='utf-8');start=content.index("test('listens for deep keys")
  text="import { deepStrictEqual } from 'node:assert'\nimport { test } from 'node:test'\nimport { deepMap, listenKeys, map } from '../index.js'\n\n"+content[start:];target='listen-keys/field-regression.test.ts';hf=hidden/'field-regression.test.ts';hf.write_text(text,encoding='utf-8')
  native=[['node','--test',*[x.relative_to(base).as_posix() for x in sorted(base.rglob('*.test.ts'))]]];accept=[['node','--test',target]]
 overlay=[{'source':str(hf),'target':target}]
 m={'id':tid,'cohort':'historical','repository':i['repository_url'].replace('https://api.github.com/repos/',''),'issue':i['number'],'url':i['html_url'],'title':i['title'],'publicBody':(p/'original-issue-body.md').read_text(encoding='utf-8'),'baseCommit':f['parents'][0]['sha'],'fixCommit':f['sha'],'baseDir':str(base),'dependencyDir':str(dep/'node_modules'),'nativeCommands':native,'acceptanceCommands':accept,'graderOverlay':overlay,'referenceFiles':prod,'controls':{'baselineAccepted':False,'referenceAccepted':False,'knownNativeFailures':[]},'complexity':reasons[tid],'provenance':str(p/'provenance.json'),'receipts':str(p/'receipts'),'dependencyNote':'Pinned minimal native behavioral-test dependencies from original project development dependency ranges. Full lint/type/size/coverage orchestration is outside these behavioral commands. Original package.json remains unchanged.','contamination':'solution-reference-in-original' if tid=='s01' else 'detailed-diagnosis-in-original' if tid=='s03' else 'clean-original-body','ready':False}
 (T/tid/'task.json').write_text(json.dumps(m,indent=2))
 print(tid,'hidden lines',len(text.splitlines()),'native files',len(native[0])-2)

