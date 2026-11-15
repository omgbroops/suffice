import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import profile from '../electron/desktop-profile.cjs';
test('a first installed launch creates its profile before Electron accepts the override',async()=>{
 const root=await mkdtemp(join(tmpdir(),'suffice-first-install-'));let selected;
 const app={getPath:name=>{assert.equal(name,'appData');return root;},setPath:(name,path)=>{assert.equal(name,'userData');assert.ok(existsSync(path));selected=path;}};
 profile.configureDesktopProfile(app,{packaged:true,argv:[]});assert.equal(selected,join(root,'@suffice','desktop'));assert.ok((await stat(selected)).isDirectory());
 await writeFile(join(selected,'projects.json'),'keep');profile.configureDesktopProfile(app,{packaged:true,argv:[]});assert.equal(await readFile(join(selected,'projects.json'),'utf8'),'keep');
});
test('explicit smoke/project profiles and development launches retain their existing paths',()=>{
 const app={getPath:()=>{throw new Error('Unexpected profile access');},setPath:()=>{throw new Error('Unexpected profile override');}};
 profile.configureDesktopProfile(app,{packaged:true,argv:['--user-data-dir=C:/isolated']});profile.configureDesktopProfile(app,{packaged:true,argv:['--user-data-dir','C:/isolated']});profile.configureDesktopProfile(app,{packaged:false,argv:[]});
});
