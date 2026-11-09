import {mkdir,readFile,writeFile,copyFile,open,unlink,statfs,lstat,symlink,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {freemem,homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash} from '../src/workspace.mjs';
import {linkDependencies,dependencySnapshot,applyPatch} from '../src/native-intelligence-eval.mjs';
import {copyRepository,repositoryFiles,repositorySnapshot,privateTestFiles,runVerification} from '../src/eval-v4/environment.mjs';
import {canonicalLabel,gradeReport,inventory} from '../src/eval-v4/grading.mjs';
import {binaryHash,publicWorkspaceRoot,stageToolchain} from '../src/eval-v4/sandbox.mjs';

const root=process.cwd(),actualBase=resolve(root,'.suffice/intelligence-v4'),base=resolve(homedir(),'.suffice-v4'),published=resolve(root,'reports/repository-intelligence-v4'),exec=promisify(execFile);
await mkdir(actualBase,{recursive:true});
try{if(!(await lstat(base)).isSymbolicLink()||(await realpath(base)).toLowerCase()!==(await realpath(actualBase)).toLowerCase())throw new Error('Existing short cache path is not this evaluation junction');}catch(error){if(error.code!=='ENOENT')throw error;await symlink(actualBase,base,'junction');}
const taskId=process.argv.find(arg=>arg.startsWith('--task='))?.slice(7);if(!taskId)throw new Error('Use --task=ID to prepare one environment at a time');
const cohort=JSON.parse(await readFile(resolve(root,'benchmarks/intelligence-v4/cohort.json'),'utf8')),descriptor=cohort.tasks.find(task=>task.id===taskId);if(!descriptor)throw new Error('Task is not in the frozen cohort');
await mkdir(base,{recursive:true});const leasePath=resolve(root,'.suffice/native-evaluation.lock'),lease=await open(leasePath,'wx');await lease.writeFile(JSON.stringify({kind:'v4-preparation',pid:process.pid,task:taskId}));
const stamp=Date.now().toString(),directory=resolve(base,'tasks',taskId),out=resolve(published,'preparation',taskId,stamp);await mkdir(directory,{recursive:true});await mkdir(out,{recursive:true});
const receipt={version:1,task:taskId,recordSha256:descriptor.recordSha256,valid:false,startedAt:new Date().toISOString(),concurrency:1,temperatureC:null};
const helpers=['native-runner.cjs','mocha-reporter.cjs','qunit-runner.cjs'];
const setupSources=['scripts/prepare-intelligence-v4.mjs','src/eval-v4/environment.mjs','src/eval-v4/grading.mjs','src/eval-v4/sandbox.mjs',...helpers.map(path=>'benchmarks/intelligence-v4/'+path)];
receipt.setupInputs=Object.fromEntries(await Promise.all(setupSources.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const download=async(url,path)=>{try{await lstat(path);return;}catch(error){if(error.code!=='ENOENT')throw error;}const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('Download '+response.status+': '+url);await writeFile(path,new Uint8Array(await response.arrayBuffer()));};
const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,COMSPEC:process.env.COMSPEC,PATH:process.env.PATH,USERPROFILE:process.env.USERPROFILE,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,TEMP:process.env.TEMP,TMP:process.env.TMP,CI:'true',NODE_OPTIONS:'--max-old-space-size=512',NPM_CONFIG_USERCONFIG:'NUL',NPM_CONFIG_CACHE:resolve(base,'npm-cache'),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_TERMINAL_PROMPT:'0'};
try{
  const disk=await statfs(root);if(freemem()<1.75*1024**3||disk.bavail*disk.bsize<6*1024**3){receipt.classification='resource_preflight';throw new Error('RESOURCE_FLOOR: need 1.75 GiB RAM and 6 GiB disk for serial preparation');}
  const bytes=await readFile(resolve(base,'records',taskId+'.json'));if(hash(bytes)!==descriptor.recordSha256)throw new Error('Sealed record changed');const record=JSON.parse(bytes);
  const existing=await readFile(resolve(directory,'validation.json'),'utf8').then(JSON.parse,error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(existing?.valid&&JSON.stringify(existing.setupInputs)===JSON.stringify(receipt.setupInputs)&&JSON.stringify(await repositorySnapshot(existing.baselineDirectory??resolve(directory,'baseline')))===JSON.stringify(existing.baselineHashes)){
    console.log(JSON.stringify({event:'v4_gate_reused',task:taskId}));await lease.close();await unlink(leasePath);process.exit(0);
  }
  console.log(JSON.stringify({event:'v4_prepare_start',task:taskId}));
  const archive=resolve(directory,'source.tar.gz');await download('https://codeload.github.com/'+record.repo+'/tar.gz/'+record.base_commit,archive);receipt.archiveSha256=await binaryHash(archive);
  await exec('python',['-c',"import tarfile,sys; tarfile.open(sys.argv[1]).extractall(sys.argv[2],filter='data')",archive,directory],{windowsHide:true,timeout:90000,maxBuffer:1024**2});
  const source=resolve(directory,record.repo.split('/')[1]+'-'+record.base_commit),pkg=JSON.parse(await readFile(resolve(source,'package.json'),'utf8'));receipt.packageVersion=pkg.version;
  const toolchain=await stageToolchain(root);let nodeRuntime;
  if(record.repo==='prettier/prettier'){
    nodeRuntime=resolve(toolchain,'node20.exe');const nodeReceipt=resolve(toolchain,'node20.receipt.json');
    try{const pinned=JSON.parse(await readFile(nodeReceipt,'utf8'));if(await binaryHash(nodeRuntime)!==pinned.binarySha256)throw new Error('Node20 binary drift');receipt.node=pinned;}
    catch(error){if(error.code!=='ENOENT')throw error;const name='node-v20.16.0-win-x64.zip',zip=resolve(toolchain,name),sumsPath=resolve(toolchain,'node20-SHASUMS256.txt');await download('https://nodejs.org/dist/v20.16.0/'+name,zip);await download('https://nodejs.org/dist/v20.16.0/SHASUMS256.txt',sumsPath);const expected=(await readFile(sumsPath,'utf8')).split('\n').find(line=>line.endsWith(name))?.split(/\s+/)[0];if(!expected||await binaryHash(zip)!==expected)throw new Error('Node20 official archive checksum mismatch');await exec('python',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]);open(sys.argv[2],'wb').write(z.read('node-v20.16.0-win-x64/node.exe'))",zip,nodeRuntime],{windowsHide:true});receipt.node={version:'20.16.0',archiveSha256:expected,binarySha256:await binaryHash(nodeRuntime)};await writeFile(nodeReceipt,JSON.stringify(receipt.node,null,2));}
  }else{
    nodeRuntime=resolve(toolchain,'node16.exe');const origin=resolve(root,'.suffice/intelligence-svelte-outro-pilot/dependencies/node_modules/.suffice-node16/node.exe'),trusted=JSON.parse(await readFile(resolve(root,'.suffice/intelligence-svelte-outro-pilot/dependency-hashes.json'),'utf8'))['.suffice-node16/node.exe'];if(await binaryHash(origin)!==trusted)throw new Error('Trusted Node16 drift');await copyFile(origin,nodeRuntime);receipt.node={version:'16.20.2',binarySha256:trusted};
  }
  const omitted=Object.keys(pkg.devDependencies??{}).filter(name=>/^(?:eslint|@types\/|cspell|node-actionlint|electron$|google-closure-compiler$|concurrently$|http-server$|rollup-watch$|uglify-js$|nyc$|prettier$)/.test(name));
  const dependencies={...(pkg.dependencies??{}),...Object.fromEntries(Object.entries(pkg.devDependencies??{}).filter(([name])=>!omitted.includes(name)))};
  // Three keeps its unit runner in a separate package to avoid shipping browser tooling.
  if(record.repo==='mrdoob/three.js'){
    const testPackage=JSON.parse(await readFile(resolve(source,'test/package.json'),'utf8'));
    const qunit=testPackage.devDependencies?.qunit??testPackage.dependencies?.qunit;
    if(!qunit)throw new Error('Missing upstream QUnit version');
    dependencies.qunit=qunit;receipt.nestedUnitDependency={qunit};
  }
  const rewrittenGit=[];for(const [name,value]of Object.entries(dependencies)){const match=/^([\w.-]+\/[\w.-]+)#([0-9a-f]{40})$/.exec(value);if(match){dependencies[name]='https://codeload.github.com/'+match[1]+'/tar.gz/'+match[2];rewrittenGit.push({name,original:value,resolved:dependencies[name]});}}
  const installPackage={name:'suffice-v4-dependencies',version:'1.0.0',private:true,dependencies},key=hash(JSON.stringify(installPackage)).slice(0,20),depot=resolve(publicWorkspaceRoot(),'deps-'+key);await mkdir(depot,{recursive:true});receipt.dependencies=depot;receipt.omittedUnusedDevPackages=omitted;receipt.gitDependencyTransport=rewrittenGit;
  const legacyDepot=resolve(base,'dependencies',key);try{await lstat(resolve(depot,'receipt.json'));}catch(error){if(error.code!=='ENOENT')throw error;try{const previous=JSON.parse(await readFile(resolve(legacyDepot,'receipt.json'),'utf8'));const {cp}=await import('node:fs/promises');await cp(legacyDepot,depot,{recursive:true});if(hash(JSON.stringify(await dependencySnapshot(resolve(depot,'node_modules'))))!==previous.contentSha256)throw new Error('Dependency relocation content mismatch');}catch(error){if(error.code!=='ENOENT')throw error;}}
  try{receipt.dependencyReceipt=JSON.parse(await readFile(resolve(depot,'receipt.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;await writeFile(resolve(depot,'package.json'),JSON.stringify(installPackage,null,2));for(const name of ['package-lock.json','yarn.lock'])try{await copyFile(resolve(source,name),resolve(depot,name));}catch(error){if(error.code!=='ENOENT')throw error;}
    const npm=resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    for(const argv of [['install','--package-lock-only'],['ci']]){const result=await exec(process.execPath,[npm,...argv,'--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund','--progress=false','--loglevel=error'],{cwd:depot,env,windowsHide:true,timeout:300000,maxBuffer:8*1024**2});await writeFile(resolve(out,'npm-'+argv[0]+'.log.txt'),result.stdout+'\n'+result.stderr);}
    const hashes=await dependencySnapshot(resolve(depot,'node_modules'));receipt.dependencyReceipt={key,lockSha256:hash(await readFile(resolve(depot,'package-lock.json'))),contentSha256:hash(JSON.stringify(hashes))};await writeFile(resolve(depot,'hashes.json'),JSON.stringify(hashes));await writeFile(resolve(depot,'receipt.json'),JSON.stringify(receipt.dependencyReceipt,null,2));
    const publishedDeps=resolve(published,'dependencies',key);await mkdir(publishedDeps,{recursive:true});for(const name of ['package.json','package-lock.json','receipt.json'])await copyFile(resolve(depot,name),resolve(publishedDeps,name));
  }
  const baseline=resolve(directory,'baselines',hash(JSON.stringify(receipt.setupInputs)).slice(0,12));receipt.baselineDirectory=baseline;
  try{await lstat(baseline);throw new Error('Baseline already exists from a nonmatching setup; preserve it and explicitly review before retry');}catch(error){if(error.code!=='ENOENT')throw error;}
  await copyRepository(source,baseline);const files=await repositoryFiles(baseline),framework=record.repo==='prettier/prettier'?'jest':record.repo==='mrdoob/three.js'?'qunit':'mocha';
  const candidates=files.filter(path=>framework==='jest'?/(?:^|\/)(?:jsfmt\.spec|format\.test)\.js$/.test(path):/^((?:lib|test|tests)\/).*\.test\.js$/.test(path));
  candidates.sort((a,b)=>hash('v4/public-smoke/'+a).localeCompare(hash('v4/public-smoke/'+b)));const publicTests=framework==='qunit'?[]:candidates.slice(0,3);if(framework!=='qunit'&&!publicTests.length)throw new Error('No public unit smoke files discovered');
  const buildSteps=[];if(framework==='qunit'&&pkg.scripts?.['build-test']){
    const match=/^rollup -c ([\w./-]+)$/.exec(pkg.scripts['build-test']);if(!match)throw new Error('Unaudited Three unit build command');const rollup=JSON.parse(await readFile(resolve(depot,'node_modules/rollup/package.json'),'utf8')),entry=typeof rollup.bin==='string'?rollup.bin:rollup.bin.rollup;if(!entry||entry.includes('..'))throw new Error('Unexpected Rollup executable');buildSteps.push(['node_modules/rollup/'+entry,'-c',match[1]]);
  }
  let mochaRequires=[];
  if(framework==='mocha')try{
    const runner=await readFile(resolve(source,'bin/test'),'utf8');
    mochaRequires=[...runner.matchAll(/['"]--require=([\w@./-]+)['"]/g)].map(match=>match[1]);
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const config={framework,nodeRuntime,publicTests,buildSteps,mochaRequires,qunitEntry:'test/unit/three.source.unit.js',selection:'Hash-sampled original public test entry points; no held-out labels used for public defaults'};
  for(const [name,target]of [['native-runner.cjs','native-verify.cjs'],['mocha-reporter.cjs','.v4-mocha-reporter.cjs'],['qunit-runner.cjs','.v4-qunit-runner.cjs']])await copyFile(resolve(root,'benchmarks/intelligence-v4',name),resolve(baseline,target));
  await writeFile(resolve(baseline,'verification.json'),JSON.stringify(config,null,2));receipt.framework=framework;receipt.privateTests=privateTestFiles(record,framework);receipt.baselineHashes=await repositorySnapshot(baseline);
  const {initializeWorkspaceGit}=await import('../src/intelligence-eval.mjs');const group=resolve(publicWorkspaceRoot(),'gate-'+taskId+'-'+stamp);await mkdir(group,{recursive:true});receipt.publicGateDirectory=group;const observations={};
  for(const variant of ['public','empty','reference']){
    console.log(JSON.stringify({event:'v4_gate_start',task:taskId,variant}));const workspace=resolve(group,variant);await copyRepository(baseline,workspace);await initializeWorkspaceGit(workspace);await linkDependencies(workspace,depot);
    if(variant==='reference')await applyPatch(workspace,record.patch,resolve(group,'reference.diff'));if(variant!=='public')await applyPatch(workspace,record.test_patch,resolve(group,'tests-'+variant+'.diff'));
    observations[variant]=await runVerification({workspace,toolchain,dependencies:depot,tests:variant==='public'?undefined:receipt.privateTests,published:resolve(out,variant)});
    if(observations[variant].executionFailure||!observations[variant].validInventory||observations[variant].loadErrors?.length||(variant!=='empty'&&observations[variant].hooks?.length))throw new Error('Invalid '+variant+' framework execution; inspect preserved diagnostics');
    if(variant==='public'&&observations[variant].tests.some(test=>test.status==='failed'))throw new Error('Original public smoke suite fails; inspect preserved diagnostics');
  }
  receipt.knownPending=observations.reference.tests.filter(test=>['pending','todo','skipped','disabled'].includes(test.status)).map(test=>test.title);receipt.expectedInventory=inventory(observations.reference);
  const options={targets:record.FAIL_TO_PASS,regressions:record.PASS_TO_PASS,expectedInventory:receipt.expectedInventory,knownPending:receipt.knownPending};
  receipt.gates={empty:gradeReport({...observations.empty,hooks:[]},{...options,expectedInventory:undefined}),reference:gradeReport(observations.reference,options)};
  receipt.emptyHooks=observations.empty.hooks;
  const targetNames=record.FAIL_TO_PASS.map(label=>canonicalLabel(label,framework));
  const allTargetsFailed=targetNames.every(label=>observations.empty.tests.some(test=>test.title===label&&test.status==='failed'));
  receipt.valid=receipt.gates.empty.valid&&receipt.gates.empty.targetsPassed===0&&allTargetsFailed&&receipt.gates.empty.regressionsPassed===record.PASS_TO_PASS.length&&receipt.gates.reference.accepted;
  receipt.classification=receipt.valid?'validated':'original_reference_gate_failure';
}catch(error){receipt.classification??='environment_or_evaluator_error';receipt.error=error.stack;receipt.stdout=error.stdout;receipt.stderr=error.stderr;}
finally{receipt.finishedAt=new Date().toISOString();receipt.wallMs=Date.now()-Number(stamp);await writeFile(resolve(out,'validation.json'),JSON.stringify(receipt,null,2));await writeFile(resolve(directory,'validation.json'),JSON.stringify(receipt,null,2));await lease.close();await unlink(leasePath);}
console.log(JSON.stringify({event:'v4_prepare_end',task:taskId,valid:receipt.valid,classification:receipt.classification,error:receipt.error}));if(!receipt.valid)process.exitCode=1;
