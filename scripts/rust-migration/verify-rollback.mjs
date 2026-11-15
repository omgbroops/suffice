import {createHash,randomUUID} from 'node:crypto';
import {copyFile,readFile,rename,writeFile,mkdtemp,rm,constants} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [rootArg,outputArg]=process.argv.slice(2);
if(!rootArg||!outputArg)throw Error('Usage: node verify-rollback.mjs ROOT NEW_OUTPUT.json');
const root=resolve(rootArg),output=resolve(outputArg),native=join(root,'packages/cli/native',`suffice-fs-${process.platform}-${process.arch}.node`),moved=native+'.rollback-'+randomUUID(),fixture=await mkdtemp(join(tmpdir(),'suffice-rollback-'));
const bytes=await readFile(native),sha=b=>createHash('sha256').update(b).digest('hex'),expected=sha(bytes),backup=join(fixture,'addon-backup.node');
await copyFile(native,backup,constants.COPYFILE_EXCL);assert.equal(sha(await readFile(backup)),expected);
await writeFile(join(fixture,'hello.txt'),'rollback fixture\n');
let result;
function check(missing){
 const code=`import assert from 'node:assert/strict';const {nativeFiles}=await import(${JSON.stringify(pathToFileURL(join(root,'packages/cli/src/native-files.mjs')).href)});const {filesIn}=await import(${JSON.stringify(pathToFileURL(join(root,'packages/cli/src/workspace.mjs')).href)});const paths=await nativeFiles(${JSON.stringify(fixture)});assert.equal(paths===null,${missing});const actual=await filesIn(${JSON.stringify(fixture)});assert(actual.includes('hello.txt'));console.log(JSON.stringify({addonLoaded:paths!==null,fallback:${missing},files:actual.length}));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true,timeout:30000});
 if(child.error||child.status!==0)throw child.error||Error(child.stderr);
 return JSON.parse(child.stdout);
}
try{
 await rename(native,moved);
 const fallback=check(true);
 await rename(moved,native);
 assert.equal(sha(await readFile(native)),expected);
 const restored=check(false);
 result={schemaVersion:1,node:process.version,addonSha256:expected,backupVerified:true,fallback,restored,restoredSha256:sha(await readFile(native)),persistenceFormatChanged:false,userDataOpened:false};
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result));
}finally{
 // Recovery only targets the exact file moved above, never an inferred directory.
 try{await readFile(native);}catch(error){if(error.code==='ENOENT')await rename(moved,native);else throw error;}
 assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));
 await rm(fixture,{recursive:true,force:true});
}
