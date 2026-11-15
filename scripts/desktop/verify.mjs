import {createReadStream} from 'node:fs';
import {readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(process.env.SUFFICE_INSTALLER_OUTPUT||'release'),files=(await readdir(root)).filter(name=>/\.(exe|dmg)$/.test(name));if(!files.length)throw new Error('No installer artifacts found');
if(process.platform==='win32'){const req=createRequire(import.meta.url),builder=createRequire(createRequire(req.resolve('electron-builder')).resolve('app-builder-lib')),seven=await builder('./toolsets/7zip.js').getPath7za();for(const file of files.filter(name=>name.endsWith('.exe')))console.log(execFileSync(seven,['t',resolve(root,file)],{encoding:'utf8',windowsHide:true,maxBuffer:1000000}));}
const digests=[];for(const name of files){const hash=createHash('sha256');for await(const chunk of createReadStream(resolve(root,name)))hash.update(chunk);digests.push({name,sha256:hash.digest('hex')});}await writeFile(resolve(root,'SHA256SUMS.txt'),digests.map(item=>item.sha256+'  '+item.name).join('\n')+'\n');await writeFile(resolve(root,'installer-validation.json'),JSON.stringify({platform:process.platform,archiveVerified:process.platform==='win32',digests},null,2)+'\n');console.log('Installer checksums written');
