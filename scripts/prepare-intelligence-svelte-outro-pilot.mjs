import {mkdir,readFile,writeFile,cp,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {freemem} from 'node:os';
import {root} from '../src/runtime.mjs';
import {hash} from '../src/workspace.mjs';
import {snapshot,initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
import {copySource,linkDependencies,dependencySnapshot,applyPatch} from '../src/native-intelligence-eval.mjs';
import {buildSvelte,testSvelte,gradeSvelte} from '../src/svelte-intelligence-pilot.mjs';
const svelteRoot=resolve(root,'.suffice/intelligence-svelte-outro-pilot');
const record=JSON.parse(await readFile(resolve(root,'benchmarks/intelligence-svelte-outro-pilot/svelte-1428.json'),'utf8')); 
const exec=promisify(execFile),disk=await statfs(root);
if(process.platform!=='win32')throw new Error('This pinned adaptation currently targets Windows');
if(freemem()<1.75*1024**3||disk.bavail*disk.bsize<6*1024**3)throw new Error('Resource floor');
await mkdir(svelteRoot,{recursive:true});
const download=async(url,target)=>{try{await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;await exec('python',['-c','import urllib.request,sys;open(sys.argv[2],"wb").write(urllib.request.urlopen(sys.argv[1],timeout=60).read())',url,target],{windowsHide:true,timeout:90000});}};
const archive=resolve(svelteRoot,'source.tar.gz');await download(`https://codeload.github.com/${record.repo}/tar.gz/${record.base_commit}`,archive);
if(hash(await readFile(archive))!==record.provenance.archiveSha256)throw new Error('Source archive drifted');
await exec('tar',['-xzf',archive,'-C',svelteRoot],{windowsHide:true});const upstream=resolve(svelteRoot,'svelte-'+record.base_commit);
const baseline=resolve(svelteRoot,'baseline');await copySource(upstream,baseline);
const dependencies=resolve(svelteRoot,'dependencies');await mkdir(dependencies,{recursive:true});
await cp(resolve(root,'benchmarks/intelligence-svelte-outro-pilot/dependency-package.json'),resolve(dependencies,'package.json'));
await cp(resolve(root,'benchmarks/intelligence-svelte-outro-pilot/dependency-lock.json'),resolve(dependencies,'package-lock.json'));
if(process.argv.includes('--reuse-dependencies')){
  const expected=JSON.parse(await readFile(resolve(svelteRoot,'dependency-hashes.json'),'utf8'));
  if(JSON.stringify(await dependencySnapshot(resolve(dependencies,'node_modules')))!==JSON.stringify(expected))throw new Error('Cannot reuse drifted dependencies');
}else{
await exec('cmd.exe',['/d','/s','/c','npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund --loglevel=error'],{cwd:dependencies,windowsHide:true,timeout:180000,maxBuffer:1024**2});
// tiny-glob 0.2.0 compares native backslash paths with slash-only regexes.
// This deterministic dependency adaptation preserves the original test globs.
const globPath=resolve(dependencies,'node_modules/tiny-glob/sync.js');
const globSource=await readFile(globPath,'utf8');
if(!globSource.includes('isMatch = lexer.regex.test(relpath);'))throw new Error('Unexpected tiny-glob source');
await writeFile(globPath,globSource.replace('isMatch = lexer.regex.test(relpath);',"isMatch = lexer.regex.test(relpath.replace(/\\\\/g, '/'));").replace('output.push(relative(opts.cwd, fullpath))',"output.push(relative(opts.cwd, fullpath).replace(/\\\\/g, '/'))"));
}
const nodeArchive=resolve(svelteRoot,'node16.zip');await download('https://nodejs.org/dist/v16.20.2/node-v16.20.2-win-x64.zip',nodeArchive);
if(hash(await readFile(nodeArchive))!=='f8bb35f6c08dc7bf14ac753509c06ed1a7ebf5b390cd3fbdc8f8c1aedd020ec3')throw new Error('Node16 archive differs from official SHASUMS256');
await exec('python',['-c','import zipfile,pathlib,sys;p=pathlib.Path(sys.argv[2]);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(zipfile.ZipFile(sys.argv[1]).read("node-v16.20.2-win-x64/node.exe"))',nodeArchive,resolve(dependencies,'node_modules/.suffice-node16/node.exe')],{windowsHide:true,timeout:30000});
await cp(resolve(root,'benchmarks/intelligence-svelte-outro-pilot/native-tests.cjs'),resolve(baseline,'native-tests.cjs'));
await cp(resolve(root,'benchmarks/intelligence-svelte-pilot/verify.cjs'),resolve(baseline,'native-verify.cjs'));
await linkDependencies(baseline,dependencies);const initialBuild=await buildSvelte(baseline);if(initialBuild.status!=='passed')throw new Error('Baseline build failed: '+initialBuild.error);
const baselineHashes=await snapshot(baseline),dependencyHashes=await dependencySnapshot(resolve(dependencies,'node_modules'));
await writeFile(resolve(svelteRoot,'dependency-hashes.json'),JSON.stringify(dependencyHashes));
const validationRoot=resolve(svelteRoot,'validation',String(Date.now())),observations={};
const clone=async name=>{const dir=resolve(validationRoot,name);await mkdir(dir,{recursive:true});await copySource(baseline,dir);await initializeWorkspaceGit(dir);await linkDependencies(dir,dependencies);return dir;};
const control=await clone('public');observations.public=await testSvelte(control,resolve(validationRoot,'public-mocha.json'));
if(observations.public.status!=='reported')throw new Error('Public test discovery failed: '+JSON.stringify(observations.public).slice(0,1500));
const knownFailures=observations.public.report.failures.map(t=>t.fullTitle),knownPending=observations.public.report.pending.map(t=>t.fullTitle);
let expectedTitleCounts; // Freeze discovery after applying the upstream test patch.
if(knownFailures.some(n=>!/^runtime binding-select \(/.test(n)&&!/^cli (dir-sourcemap|sourcemap)$/.test(n)))throw new Error('Unexpected baseline infrastructure/regression failures');
if(knownFailures.some(n=>record.FAIL_TO_PASS.includes(n)||record.PASS_TO_PASS.includes(n)))throw new Error('Scored criteria cannot be allowlisted as known failures');
const gates={};
for(const variant of ['empty','reference']){
  const workspace=await clone(variant);
  if(variant==='reference')await applyPatch(workspace,record.patch,resolve(validationRoot,'reference.diff'));
  await applyPatch(workspace,record.test_patch,resolve(validationRoot,'tests.diff'));
  const build=await buildSvelte(workspace);if(build.status!=='passed')throw new Error(variant+' build failed: '+build.error);
  const observed=await testSvelte(workspace,resolve(validationRoot,variant+'-mocha.json'));observations[variant]=observed;
  if(observed.status!=='reported')throw new Error(variant+' discovery failed');
  const titles=observed.report.tests.map(t=>t.fullTitle),counts=Object.fromEntries([...new Set(titles)].sort().map(n=>[n,titles.filter(t=>t===n).length]));
  expectedTitleCounts??=counts;
  if(JSON.stringify(counts)!==JSON.stringify(expectedTitleCounts))throw new Error('Reference/empty discovery mismatch');
  gates[variant]={acceptance:gradeSvelte(observed,record.FAIL_TO_PASS,{knownFailures,knownPending,expectedTitleCounts}),regression:gradeSvelte(observed,record.PASS_TO_PASS,{knownFailures,knownPending,expectedTitleCounts,otherEndpointTests:record.FAIL_TO_PASS})};
  console.log(JSON.stringify({variant,acceptance:gates[variant].acceptance.status,f2pPassed:gates[variant].acceptance.requiredPassed,regression:gates[variant].regression.status,p2pPassed:gates[variant].regression.requiredPassed,unexpectedFailures:gates[variant].acceptance.unexpectedFailures?.length,missing:gates[variant].acceptance.missing?.length}));
}
// Empty target failures are expected; only the reference must eliminate new failures.
const valid=gates.empty.acceptance.status==='failed'&&gates.empty.acceptance.unpassed.length===record.FAIL_TO_PASS.length&&gates.empty.acceptance.missing.length===0&&gates.reference.acceptance.status==='passed'&&gates.reference.regression.status==='passed';
const receipt={version:1,valid,node:process.version,projectNode:'v16.20.2',platform:process.platform,task:record.instance_id,provenance:record.provenance,baselineHashes,dependencyLockSha256:hash(await readFile(resolve(dependencies,'package-lock.json'))),dependencyFiles:Object.keys(dependencyHashes).length,knownFailures,knownPending,expectedTitleCounts,gates,publicStats:observations.public.report.stats,limitations:['Native Windows adaptation; not an official SWE-PolyBench score.','Nightmare/Electron custom-elements suite excluded; zero official F2P/P2P titles belong to that suite. All 6 F2P and 1,863 P2P labels are retained.','Three existing binding-select failures, two unscored CLI SourceMap write failures and existing pending tests are reported, never called passes. Acceptance requires exact passing scored titles and no new failing/pending titles.','Duplicate full titles retain frozen multiplicities; every matching case must pass and dropped cases cannot count as success.','All six F2P titles exercise transition behavior at runtime; exact test success is not a proof of every requested transition case.','Agent tools run native host processes under a scope contract, not an OS sandbox.']};
await writeFile(resolve(svelteRoot,'validation.json'),JSON.stringify(receipt,null,2));
const published=resolve(root,'reports/repository-intelligence-eval-v2/svelte-outro-pilot');await mkdir(published,{recursive:true});await writeFile(resolve(published,'validation.json'),JSON.stringify(receipt,null,2));
for(const [name,observed]of Object.entries(observations))if(observed.report)await writeFile(resolve(published,name+'-mocha.json'),JSON.stringify(observed.report,null,2));
if(!valid)throw new Error('Svelte empty/reference validation failed; no inference authorized by this runner');
