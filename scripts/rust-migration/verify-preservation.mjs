import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {execFileSync} from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map(x => { const i=x.indexOf('='); if (!x.startsWith('--') || i<0) throw new Error('Use --mode=create|verify --root=PATH --manifest=PATH'); return [x.slice(2,i),x.slice(i+1)]; }));
if (!['create','verify'].includes(args.mode) || !args.root || !args.manifest) throw new Error('Use --mode=create|verify --root=PATH --manifest=PATH');
const root=resolve(args.root), manifest=resolve(args.manifest);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inScope=p=>/^(reports|research|benchmarks)\//.test(p) || p==='reports.zip' || /^(src|packages\/cli|packages\/harness)\//.test(p) || /^scripts\/(?!rust-migration\/)/.test(p);
if(args.mode==='create') {
  const gitRoot=resolve(args['git-root'] ?? root);
  const command=args.revision ? ['-C',gitRoot,'ls-tree','-r','--name-only','-z',args.revision] : ['-C',gitRoot,'ls-files','-z'];
  const paths=execFileSync('git',command,{encoding:'utf8'}).split('\0').filter(Boolean).sort();
  const files={}; for(const path of paths) files[path]=digest(await readFile(join(root,path)));
  await writeFile(manifest,JSON.stringify({schema:1,algorithm:'sha256',sourceRoot:root,files},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({manifest,files:paths.length}));
} else {
  const data=JSON.parse(await readFile(manifest,'utf8'));
  if(data.schema!==1 || data.algorithm!=='sha256' || !data.files || typeof data.files!=='object') throw new Error('Unsupported manifest');
  const changes=[];
  for(const [path,expected] of Object.entries(data.files)) {
    if(path.startsWith('/') || path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid manifest entry: ${path}`);
    try {const actual=digest(await readFile(join(root,path))); if(actual!==expected) changes.push({path,category:inScope(path)?'scoped':'other',kind:'changed',expected,actual});}
    catch(e) {if(e.code==='ENOENT') changes.push({path,category:inScope(path)?'scoped':'other',kind:'missing',expected}); else throw e;}
  }
  console.log(JSON.stringify({manifest,root,checked:Object.keys(data.files).length,changes},null,2));
  if(changes.length) process.exitCode=1;
}
