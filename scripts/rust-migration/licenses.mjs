import {spawnSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Retain upstream notices from the exact locked Cargo package sources, including
// build dependencies. No credentials or user configuration are read here.
export async function nativeLicenses(manifest){
 const overrides=fileURLToPath(new URL('./license-overrides/',import.meta.url));
 const provenance=JSON.parse(await readFile(join(overrides,'provenance.json'),'utf8'));
 const command=spawnSync('cargo',['metadata','--locked','--format-version','1','--manifest-path',manifest],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 if(command.error||command.status!==0)throw command.error||Error(command.stderr);
 const packages=JSON.parse(command.stdout).packages.filter(p=>p.source).sort((a,b)=>a.name.localeCompare(b.name));
 let text='Suffice native traversal: locked Cargo dependency licenses\nRuntime and build-time packages are included. Upstream text follows unchanged.\n';
 for(const pkg of packages){
  const root=dirname(pkg.manifest_path),files=(await readdir(root,{withFileTypes:true})).filter(f=>f.isFile()&&/^(LICENSE|LICENCE|COPYING|COPYRIGHT|NOTICE)(?:[.\-_]|$)/i.test(f.name)).map(f=>f.name).sort();
  text+=`\n===== ${pkg.name} ${pkg.version} (${pkg.license}) =====\n`;
  if(!files.length){
   const commit=provenance.packages[`${pkg.name}@${pkg.version}`];
   if(!commit)throw Error(`Missing upstream license files for ${pkg.name} ${pkg.version}`);
   const license=await readFile(join(overrides,'napi-rs-LICENSE.txt'),'utf8');
   if(createHash('sha256').update(license).digest('hex')!==provenance.sha256)throw Error('Vendored upstream license hash mismatch');
   text+=`Source: https://github.com/napi-rs/napi-rs/blob/${commit}/LICENSE\n${license}\n`;
  }
  for(const file of files)text+=`\n--- ${file} ---\n${await readFile(join(root,file),'utf8')}\n`;
 }
 return text;
}
