"""Offline fake-process orchestration checks, without SSH or model calls."""
import ast,importlib.util,json,pathlib,tempfile,threading,subprocess,datetime,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
for name in ['benchmark/broad-runner.mjs','benchmark/broad-execution.mjs','benchmark/broad-native-worker.mjs']:
 subprocess.run(['node','--check',name],cwd=ROOT,check=True,capture_output=True)
for name in ['benchmark/broad-driver.py','benchmark/broad-sonion.py','review/broad-pull.py','review/broad-postflight.py','review/broad-report.py']:
 tree=ast.parse((ROOT/name).read_text(encoding='utf-8-sig'),filename=name);compile(tree,name,'exec')
 for n in ast.walk(tree):
  if isinstance(n,ast.Constant) and isinstance(n.value,str) and n.value.startswith(('import base64,pathlib','import pathlib,json')):compile(n.value,'generated-remote','exec')
script="const fs=require('node:fs');const s=fs.readFileSync('benchmark/broad-runner.mjs','utf8');eval(s.slice(s.indexOf('function armConfig('),s.indexOf('function nativeVerdict')));console.log(JSON.stringify(['codexSolMedium','v1SolMedium','v2LunaHigh','v1LunaHigh'].map(armConfig)))"
configs=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True));assert [(x['model'],x['effort']) for x in configs]==[('gpt-6.1-sol','medium'),('gpt-6.1-sol','medium'),('gpt-6-luna','high'),('gpt-6-luna','high')];assert configs[2]['profile']=='thin' and configs[2]['features']['advice']=='on_failure';assert all(not v for i in [0,1,3] for v in configs[i]['features'].values())
ids=[f'b{i:02}' for i in range(1,16)];modes=['codexSolMedium','v1SolMedium','v2LunaHigh','v1LunaHigh'];jobs=[{'id':id,'mode':modes[(i+j)%4]} for i,id in enumerate(ids) for j in range(4)]
manifest={'tasks':{id:{} for id in ids},'jobs':jobs,'limits':{'maxCostUsd':.25},'maxCampaignCostUsd':16,'maxConcurrency':4,'controlConcurrency':2,'minAvailableMemoryBytes':2.5*1024**3}
def scenario(kind):
 spec=importlib.util.spec_from_file_location('broad_driver',ROOT/'benchmark/broad-driver.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
 with tempfile.TemporaryDirectory(prefix='suffice-broad-check-') as temp:
  d.ROOT=pathlib.Path(temp);d.STATE=d.ROOT/'state';calls=[];controls=set();mutex=threading.Lock();active=[0];peak=[0];perIssue={};memReads=[0]
  def memory():memReads[0]+=1;return 2*1024**3 if kind=='memory' and memReads[0]==1 else 8*1024**3
  d.memory_available=memory
  def fake(args,name):
   if args[0]=='freeze':
    (d.STATE/'manifest.json').write_text(json.dumps(manifest));return 0
   if args[0]=='controls':
    with mutex:controls.add(args[1])
    return 1 if kind=='bad-control' and args[1]=='b01' else 0
   with mutex:
    assert len(controls)==15;active[0]+=1;peak[0]=max(peak[0],active[0]);perIssue[args[1]]=perIssue.get(args[1],0)+1;assert perIssue[args[1]]==1;calls.append(name)
   time.sleep(.01)
   folder=d.STATE/'attempts'/name;folder.mkdir(parents=True);bad=kind=='unknown' and args[1]=='b01';row={'identity':True,'success':kind!='known-failure','totalCostUsd':None if bad else .01,'knownCostUsd':.01,'costUnknown':bad};(folder/'result.json').write_text(json.dumps(row))
   with mutex:active[0]-=1;perIssue[args[1]]-=1
   return 2 if bad else 0
  d.invoke=fake
  if kind in ['bad-control','unknown']:
   try:d.main();raise AssertionError('Expected dispatch stop')
   except RuntimeError:pass
   assert len(calls)==0 if kind=='bad-control' else len(calls)<60
  else:
   d.main();d.main();assert len(calls)==60 and 1<=peak[0]<=4;assert json.loads((d.STATE/'complete.json').read_text())['attempts']==60
   if kind=='memory':assert memReads[0]>60
  return {'scenario':kind,'attempts':len(calls),'peakFakeActors':peak[0]}
results=[scenario(k) for k in ['complete','known-failure','bad-control','unknown','memory']]
out=ROOT/'.suffice/broad-local-validation';out.mkdir(parents=True,exist_ok=True);receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'inferenceCalls':0,'checks':['local/generated syntax','four exact arm identities/features','all fifteen controls before inference','sixty fake attempts exactly','existing result reuse without redispatch','maximum four actors and no same-issue overlap','known-cost failed tasks retained and schedule continues','invalid controls and unknown accounting halt new dispatch','memory admission waits'],'scenarios':results};(out/'result.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8');print(json.dumps(receipt))
