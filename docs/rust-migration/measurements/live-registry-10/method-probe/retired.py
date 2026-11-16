import subprocess,os,re,time,uuid,tempfile,json,plistlib
from pathlib import Path
d=Path(__file__).resolve().parent;node='/tmp/node-v24.22.2-darwin-arm64/bin/node';dom='gui/'+str(os.getuid())
def sample(pid):
 row=[l.split('\t') for l in subprocess.check_output([d/'scan'],text=True).splitlines() if l.startswith(str(pid)+'\t')][0]
 coal=json.loads(subprocess.check_output([d/'coalition',row[3]],text=True))
 return dict(ledger=coal,liveParentCpuTicks=int(row[10])+int(row[11]),liveParentPhysicalBytes=int(row[9]))
with tempfile.TemporaryDirectory(prefix='suffice-retired-') as tmp:
 t=Path(tmp); n='local.suffice.retired.'+uuid.uuid4().hex
 (t/'parent.js').write_text("""const fs=require('node:fs'),cp=require('node:child_process');let fired=false;setInterval(()=>{if(!fired&&fs.existsSync('go')){fired=true;let p=cp.spawnSync(process.execPath,['-e','let a=0;const end=Date.now()+450;while(Date.now()<end)a++;']);if(p.status!==0)process.exit(1);fs.writeFileSync('done','1');}},20);fs.writeFileSync('ready','1');""")
 pl=t/'job.plist'
 pl.write_bytes(plistlib.dumps(dict(Label=n,ProgramArguments=[node,str(t/'parent.js')],WorkingDirectory=tmp,RunAtLoad=True,ProcessType='Interactive')))
 subprocess.run(['launchctl','bootstrap',dom,str(pl)],check=True)
 try:
  for _ in range(100):
   if (t/'ready').exists():break
   time.sleep(.04)
  assert (t/'ready').exists()
  out=subprocess.check_output(['launchctl','print',dom+'/'+n],text=True);pid=int(re.search(r'^\tpid = (\d+)',out,re.M)[1]);a=sample(pid);(t/'go').touch()
  for _ in range(100):
   if (t/'done').exists():break
   time.sleep(.04)
  assert (t/'done').exists()
  b=sample(pid);la=a['ledger'];lb=b['ledger'];ret={'before':a,'after':b,'coalitionCpuDeltaMs':(lb['cpuTicks']-la['cpuTicks'])*lb['numer']/lb['denom']/1e6,'parentOnlyCpuDeltaMs':(b['liveParentCpuTicks']-a['liveParentCpuTicks'])*lb['numer']/lb['denom']/1e6,'tasksExitedDelta':lb['exited']-la['exited']}
  (d/'retired-proof.json').write_text(json.dumps(ret,indent=2));print(json.dumps(ret))
 finally:subprocess.run(['launchctl','bootout',dom+'/'+n],check=True)
