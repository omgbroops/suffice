import subprocess,pathlib,os,json,datetime
r=pathlib.Path(r'C:\Users\Mohammed\Documents\GitHub\suffice-experiments\github-field-test'); out=r/'research/historical/review-evidence';out.mkdir(exist_ok=True)
version=subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(); rows=[]
for variant,p in [('pre-fix',r/'.suffice/field/bases/h02'),('upstream-reference',r/'.suffice/field/actors/reference-h02')]:
 for rep in range(3):
  env=os.environ.copy();env['SUFFICE_WORKSPACE']=str(p)
  x=subprocess.run(['node','--test',str(r/'.suffice/field/private/h02.test.mjs')],cwd=p,env=env,capture_output=True,text=True,encoding='utf-8',timeout=20)
  row={'variant':variant,'repetition':rep+1,'node':version,'exitCode':x.returncode,'stdout':x.stdout,'stderr':x.stderr,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()};rows.append(row);print(json.dumps({k:v for k,v in row.items() if k not in ['stdout','stderr']}))
(out/'independent-control-repeats.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
