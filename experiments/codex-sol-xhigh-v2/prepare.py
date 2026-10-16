"""Create a model-effort-only Suffice copy and external native-Codex bindings."""
import hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
HERE=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
frozen=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text())['inputs']
manifest={}
for rel,expected in frozen.items():
    b=(ROOT/rel).read_bytes()
    assert sha(b)==expected,rel
    variant=b
    if rel=='src/general/agent.mjs':
        s=b.decode();assert s.count("'low'")==2
        variant=s.replace("'low'","'xhigh'").encode()
    elif rel=='configs/general-v1.json':
        d=json.loads(b);d['effort']='xhigh';d['limits']['maxCostUsd']=10
        variant=(json.dumps(d,indent=2)+'\n').encode()
    dest=HERE/'runtime-source'/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(variant)
    manifest[rel]={'originalSha256':expected,'variantSha256':sha(variant),'changed':variant!=b}
(HERE/'source-manifest.json').write_text(json.dumps({'inputs':manifest,'allowedChanges':'Sol low to Sol xhigh; config cost ceiling only; all tools, system prompt, execution logic unchanged'},indent=2)+'\n')
def replace(s,a,b):
    assert a in s,a[:100]
    return s.replace(a,b)
s=(ROOT/'scripts/sonion-execution.mjs').read_text()
s=replace(s,"export const ROOT=resolve(import.meta.dirname,'..');","export const ROOT=resolve(import.meta.dirname,'../..');")
s=replace(s,"export const LINUX_RUNTIME='/home/eric_qin/suffice-general-runtime';","export const LINUX_RUNTIME='/home/eric_qin/suffice-sol-xhigh-runtime';\nconst NODE_RUNTIME='/home/eric_qin/suffice-general-runtime';")
start=s.index('export async function stageRuntime()');end=s.index('export async function executeIsolated',start)
s=s[:start]+'''export async function stageRuntime(){
 const manifest=JSON.parse(await (await import('node:fs/promises')).readFile(resolve(ROOT,'experiments/codex-sol-xhigh-v2/source-manifest.json'),'utf8'));
 const crypto=await import('node:crypto');
 for(const [p,e]of Object.entries(manifest.inputs)){
  const bytes=await (await import('node:fs/promises')).readFile(resolve(ROOT,'experiments/codex-sol-xhigh-v2/runtime-source',p));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==e.variantSha256)throw Error('Variant drift '+p);
  const target=resolve(LINUX_RUNTIME,'app',p);await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,bytes);
 }
 await mkdir(resolve(LINUX_RUNTIME,'app/node_modules'),{recursive:true});await mkdir(resolve(LINUX_RUNTIME,'app/.suffice/pi'),{recursive:true});
 return Object.keys(manifest.inputs);
}
'''+s[end:]
s=replace(s,"input='',privateRoots=[]","input='',codexHome=null,privateRoots=[]")
s=replace(s,"'--ro-bind',LINUX_RUNTIME,'/node'","'--ro-bind',NODE_RUNTIME,'/node'")
s=replace(s,"'--ro-bind',LINUX_RUNTIME+'/app','/runtime','--bind',workspace", "'--ro-bind',LINUX_RUNTIME+'/app','/runtime','--ro-bind',NODE_RUNTIME+'/app/node_modules','/runtime/node_modules','--bind',workspace")
s=replace(s," for(const p of gitMetadata)"," if(codexHome)args.push('--ro-bind','/home/eric_qin/suffice-codex-runtime-0163','/codexruntime','--bind',codexHome,'/codex-home','--ro-bind',resolve(ROOT,'experiments/codex-sol-xhigh-v2/native-worker.mjs'),'/native-worker.mjs');\n for(const p of gitMetadata)")
s=replace(s,"'--chdir','/workspace'","...(codexHome?['--setenv','CODEX_HOME','/codex-home']:[]),'--chdir','/workspace'")
s=replace(s,"import {spawn} from 'node:child_process';","import {spawn} from 'node:child_process';\nimport {readFileSync,readdirSync} from 'node:fs';")
s=s.replace('addressSpaceBytes:8*1024**3','addressSpaceBytes:2*1024**4,aggregateRssCeilingBytes:2*1024**3').replace('--as=8589934592','--as=2199023255552')
s=replace(s,"  const timer=setTimeout(stop,timeoutMs+5000);",'''  let peakRssBytes=0,resourceStop=null;
  const rssTimer=setInterval(()=>{try{
   const rows=new Map();for(const p of readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){try{const s=readFileSync('/proc/'+p+'/status','utf8');rows.set(Number(p),{parent:Number(s.match(/^PPid:\\s+(\\d+)/m)?.[1]),rss:Number(s.match(/^VmRSS:\\s+(\\d+)/m)?.[1]??0)*1024});}catch{}}
   const pending=[child.pid];let rss=0;while(pending.length){const pid=pending.pop();rss+=rows.get(pid)?.rss??0;for(const[p,v]of rows)if(v.parent===pid)pending.push(p);}
   peakRssBytes=Math.max(peakRssBytes,rss);if(rss>2*1024**3){resourceStop='aggregate_rss_limit';stop();}
  }catch{}},1000);
  const timer=setTimeout(stop,timeoutMs+5000);''')
s=replace(s,"clearTimeout(timer);const result={exitCode:code,", "clearTimeout(timer);clearInterval(rssTimer);const result={peakRssBytes,resourceStop,exitCode:code,")
(HERE/'execution.mjs').write_text(s)
print(json.dumps({'frozenOriginals':len(manifest),'changedCopies':[r for r,e in manifest.items()if e['changed']],'inferenceCalls':0}))
