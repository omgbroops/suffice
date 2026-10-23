// Development fixtures only. No private evaluator exists in this materializer.
import {mkdir,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {hash} from '../src/v9/workspace.mjs';
import {realTasks} from '../benchmarks/real/tasks.mjs';
import {runProcess} from '../src/v9/process.mjs';
const root=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Usage: node scripts/v10-pilot.mjs <new-directory>');
await mkdir(root,{recursive:false});
const tasks=[{
  id:'retry',file:'retry.mjs',
  prompt:`Implement src/retry.mjs exporting async retry(operation, options = {}). Options: attempts defaults to 3 and must be a positive integer; baseDelayMs defaults to 0 and must be finite and nonnegative. Validate both before invoking operation. sleep defaults to an async no-op, shouldRetry defaults to a predicate returning true. Pass a one-based attempt number to operation. Resolve immediately on success. On rejection, preserve the exact error identity; consult shouldRetry(error, attempt) only when another attempt remains. A false predicate stops retries. Between retryable failures call await sleep(baseDelayMs * 2 ** (attempt - 1)); never sleep after success or the final failure. An optional AbortSignal must be checked before each operation and after sleep; reject with signal.reason when present, otherwise an Error named AbortError. No operation runs when already aborted. Predicate and sleep errors propagate unchanged. Preserve the export and existing tests.`,
  source:'export async function retry(operation, options = {}) { return operation(1); }\n',
  test:`import {test} from 'node:test';import assert from 'node:assert/strict';import {retry} from '../src/retry.mjs';
test('success',async()=>assert.equal(await retry(n=>n),1));
test('retry once',async()=>{let calls=0;assert.equal(await retry(()=>{if(++calls===1)throw Error('again');return 7;}),7);assert.equal(calls,2);});\n`
},{
  id:'json-lines',file:'json-lines.mjs',
  prompt:`Implement src/json-lines.mjs exporting async generator parseJsonLines(chunks). Accept sync or async iterables of strings or Uint8Array chunks. Parse newline-delimited JSON across arbitrary chunk boundaries, including UTF-8 multibyte characters split across byte chunks. Both LF and CRLF are line separators. Ignore blank or whitespace-only physical lines. Parse a final nonempty line without a trailing newline. Strip one optional initial UTF-8 BOM, only at the beginning of the entire stream. Yield decoded JSON values in order. Malformed JSON must throw SyntaxError with a numeric lineNumber property giving the one-based physical line, counting blank lines too. Preserve upstream iterator error identity. Use incremental processing, preserving the export and existing tests.`,
  source:"export async function* parseJsonLines(chunks) { for await (const chunk of chunks) { for (const line of String(chunk).split('\\n')) if (line.trim()) yield JSON.parse(line); } }\n",
  test:`import {test} from 'node:test';import assert from 'node:assert/strict';import {parseJsonLines} from '../src/json-lines.mjs';const collect=async chunks=>{const out=[];for await(const v of parseJsonLines(chunks))out.push(v);return out;};
test('basic',async()=>assert.deepEqual(await collect(['1\\n2\\n']),[1,2]));
test('split line',async()=>assert.deepEqual(await collect(['{"a":','1}\\n']),[{a:1}]));\n`
}];
for(const task of tasks){
  const workspace=join(root,task.id);await mkdir(join(workspace,'src'),{recursive:true});await mkdir(join(workspace,'test'));
  await writeFile(join(workspace,'src',task.file),task.source);await writeFile(join(workspace,'test/public.test.mjs'),task.test);
  const result=await runProcess('git',['init','--quiet'],{cwd:workspace});if(result.exitCode!==0)throw Error(result.stderr);
}
const publicTasks=tasks.map(t=>({id:t.id,workspace:t.id,prompt:t.prompt,checks:[{id:'public',command:['node','--test','test/public.test.mjs'],testsRequired:true}],contextPaths:[`src/${t.file}`]}));
if(process.argv.includes('--real')){
  const revision='efa4be6096c1f9b77d9d27d6132f6220c43b4e31',url=`https://codeload.github.com/npm/node-semver/tar.gz/${revision}`;
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Upstream download failed');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5000000)throw Error('Upstream source exceeds pilot download allowance');
  const archive=join(root,'semver.tar.gz'),upstream=join(root,'upstream');await writeFile(archive,bytes);await mkdir(upstream);
  const inventory=await runProcess('tar',['-tzf',archive]);if(inventory.exitCode!==0||inventory.stdout.split(/\r?\n/).filter(Boolean).some(path=>!path.startsWith(`node-semver-${revision}/`)||path.split('/').includes('..')||path.includes('\\')))throw Error('Unsafe upstream archive paths');
  const extract=await runProcess('tar',['-xzf',archive,'-C',upstream,'--strip-components','1']);if(extract.exitCode!==0)throw Error('Upstream extraction failed');
  await writeFile(join(root,'upstream-receipt.json'),JSON.stringify({url,revision,sha256:hash(bytes),bytes:bytes.length},null,2));
  for(const id of ['prerelease-subset','build-metadata']){
    const task=realTasks.find(t=>t.id===id),workspace=join(root,id);await mkdir(join(workspace,'test'),{recursive:true});await cp(upstream,join(workspace,'src'),{recursive:true});
    const reproduction=id==='prerelease-subset'?"assert.equal(semver.subset('^10.2.0-beta.2','^10.2.0-beta.1'),true);":"assert.equal(semver.validRange('4.17.0+'+'a'.repeat(250)+'3',{loose:true}),'4.17.0');";
    const source=`import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),semver=require('../src/index.js');\ntest('ordinary ranges',()=>{assert.equal(semver.satisfies('1.2.3','^1.0.0'),true);assert.equal(semver.satisfies('2.0.0','^1.0.0'),false);});\ntest('normal prerelease exclusion',()=>assert.equal(semver.satisfies('1.2.3-beta.1','^1.0.0'),false));\ntest('public issue reproduction',()=>{${reproduction}});\n`;
    await writeFile(join(workspace,'test/public.test.mjs'),source);const git=await runProcess('git',['init','--quiet'],{cwd:workspace});if(git.exitCode!==0)throw Error('Task Git initialization failed');
    publicTasks.push({id,workspace:id,prompt:task.prompt+' The upstream repository and its original layout are under src/. Preserve existing tests. Public checks are adapted Node tests, not the complete upstream TAP suite.',checks:[{id:'public',command:['node','--test','test/public.test.mjs'],testsRequired:true}],contextPaths:['src/index.js']});
  }
}
await writeFile(join(root,'public-manifest.json'),JSON.stringify({id:'v10-pi-development-pilot',label:'Development fixtures and optional historical node-semver replays; not held-out efficacy evidence',seed:20261023,repetitions:1,
  limits:{maxCostUsd:.5,timeoutMs:300000,overallCostUsd:9},tasks:publicTasks},null,2)+'\n',{flag:'wx'});
console.log(join(root,'public-manifest.json'));
