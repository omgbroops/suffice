import pathlib, subprocess, shutil, json, datetime
root=pathlib.Path(__file__).resolve().parents[1];tasks=root/'.suffice/field-campaign-v1/tasks'
for task in ['l01','l02','l03']:
 d=tasks/task;control=d/'controls/reproduction';control.mkdir(parents=True,exist_ok=True)
 for name in ['package.json','index.js']:
  if (d/'base'/name).exists():shutil.copy2(d/'base'/name,control/name)
 if task=='l01':shutil.copytree(d/'base/src',control/'src',dirs_exist_ok=True)
 shutil.copy2(d/'grader/acceptance.test.mjs',control/'acceptance.test.mjs')
 linux='/mnt/c'+str(control.resolve()).replace('\\','/')[2:]
 p=subprocess.run(['wsl.exe','-d','Ubuntu','--','env','PATH=/home/mohammed/suffice-general-runtime/bin:/usr/bin:/bin','node','--test',linux+'/acceptance.test.mjs'],capture_output=True,text=True,encoding='utf-8')
 receipts=root/'research/field-campaign-v1/live'/task/'receipts';receipts.mkdir(parents=True,exist_ok=True)
 (receipts/'reproduction.stdout.txt').write_text(p.stdout,encoding='utf-8');(receipts/'reproduction.stderr.txt').write_text(p.stderr,encoding='utf-8')
 (receipts/'reproduction.json').write_text(json.dumps({'exitCode':p.returncode,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':p.args},indent=2),encoding='utf-8')
 print(task,p.returncode,p.stdout[-1000:],p.stderr[-500:],flush=True)
