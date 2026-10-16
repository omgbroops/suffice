// Environment compatibility only: execute unchanged upstream suites in process.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=resolve('.suffice/field/bases');
const common=`import test from 'node:test';
import assert from 'node:assert/strict';
import Mocha from 'mocha';
`;
const h=common+`test('unchanged upstream Headers Request Response suites', async () => {
 const mocha=new Mocha({reporter:'dot',timeout:4000});
 for(const p of ['test/headers.js','test/request.js','test/response.js'])mocha.addFile(p);
 await mocha.loadFilesAsync();
 const runner=mocha.run();
 await new Promise(resolve=>runner.once('end',resolve));
 console.log(JSON.stringify({nativeStats:runner.stats}));
 assert.ok(runner.stats.tests===63,'Native suites must actually execute');
 assert.equal(runner.stats.failures,0);
});
`;
const loader=`// Standard TypeScript CommonJS transpilation for unchanged upstream TS suites.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>{
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:false}}).outputText;
 module._compile(code,filename);
};
`;
const l=common+loader+`test('unchanged upstream semaphore suite', async () => {
 const mocha=new Mocha({reporter:'dot',ui:'tdd',timeout:4000});
 for(const p of ['test/semaphore.ts'])mocha.addFile(p);
 mocha.loadFiles();
 const runner=mocha.run();
 await new Promise(resolve=>runner.once('end',resolve));
 console.log(JSON.stringify({nativeStats:runner.stats}));
 assert.ok(runner.stats.tests>20,'Native suites must actually execute');
 assert.equal(runner.stats.failures,0);
});
`;
for(const[id,source]of [['h02',h],['l01',l]]){
 await mkdir(resolve(base,id,'tests'),{recursive:true});
 await writeFile(resolve(base,id,'tests/visible.test.mjs'),source);
}
await mkdir('.suffice/field/private',{recursive:true});
await writeFile('.suffice/field/private/ts-loader.mjs',loader);
