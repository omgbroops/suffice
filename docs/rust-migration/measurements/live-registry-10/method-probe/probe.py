import sys,time,os,subprocess,plistlib,uuid,tempfile,json,re,hashlib,shutil
from pathlib import Path
root=Path.cwd()
dest=root/'.ci-logs/perf-discovery-10-method'
fields='pid ppid responsible resource jetsam coal_error rusage_error identity rss physical user_ticks sys_ticks comm'.split()
def scan():
 rows={}
 for line in subprocess.check_output([dest/'scan'],text=True).splitlines()[1:]:
  cols=line.split('\t'); row={k:int(v) if k!='comm' else v for k,v in zip(fields,cols)}
  rows[row['pid']]=row
 return rows
def webkit_ps():
 rows={}
 for line in subprocess.check_output(['ps','-A','-o','uid=,pid=,comm='],text=True).splitlines():
  parts=line.strip().split(None,2)
  if len(parts)!=3 or int(parts[0])!=os.getuid():continue
  name=Path(parts[2]).name
  if name.startswith('com.apple.WebKit.'):rows[int(parts[1])]=name
 return rows

def inspect(name,pid,rows):
 own={pid}
 prev=None
 while prev!=own:
  prev=own.copy()
  own.update(x for x,r in rows.items() if r['ppid'] in own or r['responsible']==pid or (r['resource'] and r['resource']==rows[pid]['resource']) or (r['jetsam'] and r['jetsam']==rows[pid]['jetsam']))
 return [dict(r,via=[key for key,cond in [('root',r['pid']==pid),('parent',r['ppid'] in own),('responsible',r['responsible']==pid),('resource',r['resource']==rows[pid]['resource']),('jetsam',r['jetsam']==rows[pid]['jetsam'])] if cond]) for x,r in rows.items() if x in own]

def main():
 global root
 root=Path((dest/'staging-root').read_text().strip()).resolve()
 kind=sys.argv[1] if len(sys.argv)>1 else 'full'
 labels=[];domain='gui/'+str(os.getuid())
 receipt={'os':subprocess.check_output(['sw_vers'],text=True),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'kind':'attribution-only; concurrent synthetic control; no benchmarking','samples':[]}
 baseline=webkit_ps()
 scratch=Path(tempfile.mkdtemp(prefix='suffice-attribution-'))
 try:
  hosts=[('wry',root/'apps/desktop-rust/target/release/suffice-desktop-rust'),('electron',root/'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),('control',root/'apps/desktop-rust/target/release/suffice-desktop-rust')]
  pids={}
  receipt['sha256']={n:hashlib.sha256(prog.read_bytes()).hexdigest() for n,prog in hosts}
  for name,prog in hosts:
   base=scratch/name;home=base/'home';profile=base/'profile';project=base/'project'
   for d in (home,profile,project):d.mkdir(parents=True,exist_ok=True)
   env={'PI_OFFLINE':'1','SUFFICE_HOME':str(home),'SUFFICE_START_PROJECT':str(project),'PATH':'/tmp/node-v24.22.2-darwin-arm64/bin:/usr/bin:/bin:/usr/sbin:/sbin'}
   args=[str(prog),str(root/'apps/desktop'),'--user-data-dir='+str(profile)] if name=='electron' else [str(prog),'--root',str(root),'--node','/tmp/node-v24.22.2-darwin-arm64/bin/node','--home',str(home),'--profile',str(profile)]
   label='local.suffice.attribution.'+uuid.uuid4().hex;f=base/'launch.plist'
   f.write_bytes(plistlib.dumps(dict(Label=label,WorkingDirectory=str(root),ProgramArguments=args,EnvironmentVariables=env,RunAtLoad=True,ProcessType='Interactive',StandardErrorPath=str(base/'stderr'),StandardOutPath=str(base/'stdout'))))
   subprocess.run(['launchctl','bootstrap',domain,str(f)],check=True);labels.append(label)
   for _ in range(40):
    out=subprocess.check_output(['launchctl','print',domain+'/'+label],text=True)
    m=re.search(r'^\tpid = (\d+)',out,re.M)
    if m and int(m[1]) in scan(): break
    time.sleep(.1)
   assert m, 'no root'
   pids[name]=int(m[1])
   print(name,pids[name],flush=True)
   time.sleep(1)
  receipt['rootPids']=pids
  for _ in range(4):
   time.sleep(2); p=scan(); cur=webkit_ps()
   sample={'monotonic':time.monotonic(),'hosts':{name:inspect(name,pid,p) for name,pid in pids.items()},'baselineUnrelatedWebKitCount':len(baseline),'psWebKitMissingFromLibproc':len(set(cur)-set(p))}
   claimed={r['pid'] for rows in sample['hosts'].values() for r in rows}
   sample['unassignedNewWebKitRoles']=[v for k,v in cur.items() if k not in baseline and k not in claimed]
   sample['preexistingWebKitCounted']=len(claimed & baseline.keys())
   sample['ledgers']={n:json.loads(subprocess.check_output([dest/'coalition',str(p[pid]['resource'])],text=True)) for n,pid in pids.items()}
   sample['crossAttributedPidCount']=sum(len(v) for v in sample['hosts'].values())-len(claimed)
   receipt['samples'].append(sample)
 finally:
  for label in reversed(labels):subprocess.run(['launchctl','bootout',domain+'/'+label],check=False)
  time.sleep(1)
  remaining=scan()
  receipt['residualOwned']=[(r['pid'],r['comm']) for rs in receipt['samples'][-1:] for rows in rs['hosts'].values() for r in rows if r['pid'] in remaining and remaining[r['pid']]['identity']==r['identity']]
  for name in ['wry','control','electron']:
   for stream in ['stdout','stderr']:
    logfile=scratch/name/stream
    if logfile.exists():(dest/(name+'-'+stream+'.log')).write_bytes(logfile.read_bytes())
  (dest/'attribution.json').write_text(json.dumps(receipt,indent=2))
  # Retain the private synthetic profile receipts so the exact WebKit named
  # stores can be cleared later using their saved UUID. Never infer from age.
  receipt['syntheticScratchPath']=str(scratch)
  (dest/'attribution.json').write_text(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
