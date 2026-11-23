import {createReadStream} from 'node:fs';
import {readdir,writeFile,mkdtemp,readFile,access,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {createRequire} from 'node:module';
const asar=createRequire(import.meta.url)('@electron/asar');
const root=resolve(process.env.SUFFICE_INSTALLER_OUTPUT||'release'),files=(await readdir(root)).filter(name=>/\.(exe|dmg)$/.test(name));if(!files.length)throw new Error('No installer artifacts found');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',maxBuffer:1e7});
const ok=async p=>access(p).then(()=>true,()=>false);
// Resolve every relative/bare import of a module file so a missing file fails here, not at first launch.
async function check(app,file,seen=new Set()){
 if(seen.has(file))return;seen.add(file);
 const src=await readFile(file,'utf8');
 for(const m of src.matchAll(/(?<![\w$"'.])(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)){const s=m[1];
  if(s.startsWith('.')){const t=resolve(dirname(file),s);if(!await ok(t))throw new Error('Unresolved import '+s+' in '+file);if(/\.m?js$/.test(t))await check(app,t,seen);}
  else if(!s.startsWith('node:')&&s!=='electron'){const name=s.split('/').slice(0,s.startsWith('@')?2:1).join('/');if(!await ok(join(app,'node_modules',name,'package.json')))throw new Error('Missing package '+name+' for '+file);}}
}
const dmgs=[];let extracted;
for(const name of files.filter(n=>n.endsWith('.dmg'))){
 const dmg=resolve(root,name);run('hdiutil',['verify',dmg]);
 const mnt=await mkdtemp(join(tmpdir(),'suffice-dmg-'));
 try{run('hdiutil',['attach','-nobrowse','-readonly','-noautoopen','-mountpoint',mnt,dmg]);
  const app=join(mnt,'Suffice.app');
  const plist=run('plutil',['-convert','json','-o','-',join(app,'Contents/Info.plist')]),info=JSON.parse(plist);
  if(info.CFBundleIdentifier!=='com.suffice.app')throw new Error('Bad bundle id '+info.CFBundleIdentifier);
  run('codesign',['--verify','--deep','--strict',app]);
  // The app ships as app.asar (+ app.asar.unpacked for spawned binaries); unpack to a temp dir so the file checks below see real paths.
  const res=join(await mkdtemp(join(tmpdir(),'suffice-asar-')),'app');extracted=dirname(res);asar.extractAll(join(app,'Contents/Resources/app.asar'),res);
  for(const bin of ['node_modules/agent-browser','node_modules/agent-desktop','node_modules/node-pty'])if(!await ok(join(app,'Contents/Resources/app.asar.unpacked',bin)))throw new Error('Not unpacked: '+bin);
if(!await ok(join(res,'apps/desktop/dist/index.html')))throw new Error('dist/index.html missing');
  const main=JSON.parse(await readFile(join(res,'package.json'),'utf8')).main;await check(res,join(res,main));
  console.log('OK',name,info.CFBundleIdentifier,info.CFBundleShortVersionString,'main='+main);
 }finally{try{run('hdiutil',['detach',mnt])}catch{run('hdiutil',['detach','-force',mnt])}await rm(mnt,{recursive:true,force:true});if(extracted)await rm(extracted,{recursive:true,force:true});}
}
const digests=[];for(const name of files){const hash=createHash('sha256');for await(const chunk of createReadStream(resolve(root,name)))hash.update(chunk);digests.push({name,sha256:hash.digest('hex')});}
await writeFile(resolve(root,'SHA256SUMS.txt'),digests.map(d=>d.sha256+'  '+d.name).join('\n')+'\n');console.log('Installer verified; checksums written');
