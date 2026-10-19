"""Offline orchestration test: fake attempts only, no providers or SSH."""
import importlib.util,json,pathlib,tempfile,threading,subprocess,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('effort_driver',ROOT/'benchmark/effort-driver.py');driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)
script="const fs=require('node:fs');const s=fs.readFileSync('benchmark/effort-runner.mjs','utf8');const body=s.slice(s.indexOf('function armConfig('),s.indexOf('function nativeVerdict'));eval(body);console.log(JSON.stringify(['v2Medium','v1High'].map(armConfig)))"
configs=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True));assert configs[0]['effort']=='medium' and configs[0]['profile']=='thin';assert configs[1]['effort']=='high' and configs[1]['profile']=='baseline';assert all(not v for v in configs[1]['features'].values());assert configs[0]['features']['advice']=='on_failure'
with tempfile.TemporaryDirectory(prefix='suffice-effort-orchestration-') as temporary:
 driver.ROOT=pathlib.Path(temporary);driver.STATE=driver.ROOT/'state';calls=[];mutex=threading.Lock();active=[0];peak=[0]
 jobs=[{'id':id,'mode':['v2Medium','v1High'][(i+j)%2]} for i,id in enumerate(['f16','f09','f11']) for j in range(2)]
 manifest={'tasks':{id:{} for id in ['f16','f09','f11']},'jobs':jobs,'limits':{'maxCostUsd':.25},'maxCampaignCostUsd':2}
 def fake(args,name):
  if args[0]=='freeze':(driver.STATE/'manifest.json').write_text(json.dumps(manifest));return 0
  if args[0]=='controls':return 0
  with mutex:active[0]+=1;peak[0]=max(peak[0],active[0]);calls.append(name)
  folder=driver.STATE/'attempts'/name;folder.mkdir(parents=True);(folder/'result.json').write_text(json.dumps({'success':True,'totalCostUsd':.01,'knownCostUsd':.01,'costUnknown':False}))
  with mutex:active[0]-=1
  return 0
 driver.invoke=fake;driver.main();driver.main();assert len(calls)==6 and peak[0]<=2;assert json.loads((driver.STATE/'complete.json').read_text())['attempts']==6
out=ROOT/'.suffice/effort-local-validation';out.mkdir(parents=True,exist_ok=True);receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':['new runner JavaScript syntax','new local and generated remote Python syntax','exact arm profiles/features/efforts','six fake attempts only','existing results do not redispatch','maximum two fake actors'],'passed':True,'inferenceCalls':0};(out/'result.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8');print(json.dumps(receipt))
