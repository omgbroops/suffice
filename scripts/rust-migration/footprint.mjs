import {readdir,stat,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
const [baselineArg,currentArg,outputArg,webviewArg]=process.argv.slice(2);
if(!baselineArg||!currentArg||!outputArg)throw Error('Usage: node footprint.mjs BASELINE CURRENT NEW_OUTPUT.json [WEBVIEW2_RUNTIME_DIRECTORY]');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function tree(root){let bytes=0,files=0;const pending=[root];while(pending.length){const dir=pending.pop();for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())pending.push(path);else if(entry.isFile()){bytes+=(await stat(path)).size;files++;}}}return {logicalBytes:bytes,files,symlinks:'not followed',allocatedDiskBytes:'not measured'};}
async function app(root){
 const release=join(root,'release'),build=JSON.parse(await readFile(join(release,'build-result.json'),'utf8'));
 const installer=build.artifacts.find(file=>file.endsWith('.exe')&&!file.includes('__uninstaller'));
 if(!installer)throw Error('Windows installer artifact missing');
 const bytes=await readFile(installer),installed=join(release,'win-unpacked'),modules=join(installed,'resources/app/node_modules');
 return {version:build.version,platform:build.platform,arch:build.arch,installer:{bytes:bytes.length,sha256:hash(bytes)},installed:await tree(installed),optionalAutomation:{browser:await tree(join(modules,'agent-browser')),desktop:await tree(join(modules,'agent-desktop')),runtimeUse:'direct package directories only; native platform/transitive packages are included in total installed footprint but not attributed here. Not activated in desktop benchmarks; active optional automation overhead unmeasured'},renderer:await tree(join(root,'apps/desktop/dist'))};
}
const result={schemaVersion:1,createdAt:new Date().toISOString(),method:'logical file sizes of local Windows NSIS installer and unpacked release tree; no install into user profile, no compression/allocation inference',hardware:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,ramBytes:os.totalmem(),osType:os.type(),osRelease:os.release(),node:process.version},baseline:await app(resolve(baselineArg)),current:await app(resolve(currentArg))};
if(webviewArg)result.sharedWebView2={directory:resolve(webviewArg),...await tree(resolve(webviewArg)),qualification:'OS-shared runtime excluded from Wry probe executable size; existing installation, not a measured fresh download'};
await writeFile(resolve(outputArg),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({baseline:result.baseline.installed,current:result.current.installed,installerBytes:[result.baseline.installer.bytes,result.current.installer.bytes]}));
