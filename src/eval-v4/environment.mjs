import {readFile,writeFile,mkdir,readdir,lstat,cp,unlink,realpath} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {hash} from '../workspace.mjs';
import {linkDependencies,applyPatch} from '../native-intelligence-eval.mjs';
import {sandboxOperations} from './sandbox.mjs';
import {normalizeReport,gradeReport} from './grading.mjs';

export async function repositoryFiles(root,directory=''){
  const paths=[];
  for(const entry of (await readdir(resolve(root,directory),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!directory&&['.git','node_modules','.v4-tmp'].includes(entry.name))continue;
    const path=[directory,entry.name].filter(Boolean).join('/');
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory())paths.push(...await repositoryFiles(root,path));else if(entry.isFile())paths.push(path);
  }
  return paths.sort();
}
export async function repositorySnapshot(root){const paths=await repositoryFiles(root),entries=[];for(let i=0;i<paths.length;i+=16)entries.push(...await Promise.all(paths.slice(i,i+16).map(async path=>[path,hash(await readFile(resolve(root,path)))])));return Object.fromEntries(entries);}
export async function copyRepository(source,destination){
  await cp(source,destination,{recursive:true,filter:path=>{const rel=relative(source,path).split(sep)[0];return !['node_modules','.git'].includes(rel);}});
}
export function productionPath(repo,path){
  if(/(^|\/)(?:test|tests|__tests__|__snapshots__|fixtures)(\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path))return false;
  if(repo==='serverless/serverless')return /^(?:lib|bin)\//.test(path);
  if(repo==='prettier/prettier')return /^(?:src|bin)\//.test(path)||/^(?:index|standalone|doc|parser-[^/]+)\.[cm]?js$/.test(path);
  if(repo==='mrdoob/three.js')return /^(?:src|examples\/jsm?)\//.test(path);
  throw new Error('Unknown frozen repository family');
}
export const protectedEvaluationPath=path=>/^(?:native-verify\.cjs|verification\.json|\.v4-(?:mocha-reporter|qunit-runner)\.cjs|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|jest\.config\.[cm]?js|\.mocha.*)$/.test(path);
export function allowedAgentChange(repo,path){
  return !protectedEvaluationPath(path)&&(!path.startsWith('.')||path.startsWith('.v4-tmp/'))&&!path.startsWith('node_modules/');
}
export function privateTestFiles(record,framework){
  if(framework==='qunit')return [];
  if(framework==='jest')return [...new Set([...record.FAIL_TO_PASS,...record.PASS_TO_PASS].map(label=>label.split('->')[0].replace(/^\/testbed\//,'')))].sort();
  const matches=record.test_command.match(/(?:[\w@.-]+\/)+[\w.-]+\.(?:test|spec)\.[cm]?js/g);
  if(!matches?.length)throw new Error('No audited Mocha unit paths in dataset command');
  return [...new Set(matches)].sort();
}
export async function runVerification({workspace,toolchain,dependencies,tests,published}){
  const tmp=resolve(workspace,'.v4-tmp');await mkdir(tmp,{recursive:true});
  const reportPath=resolve(tmp,'independent-report.json');try{await unlink(reportPath);}catch(error){if(error.code!=='ENOENT')throw error;}
  let command='node native-verify.cjs --report .v4-tmp/independent-report.json';
  if(tests){await writeFile(resolve(tmp,'selected-tests.json'),JSON.stringify(tests));command+=' --tests-json .v4-tmp/selected-tests.json';}
  const operations=await sandboxOperations({workspace,toolchain,readableRoots:[toolchain,resolve(dependencies,'node_modules')]}),start=performance.now();let output='';
  const exit=await operations.exec(command,workspace,{timeout:420,onData:chunk=>{output+=chunk;if(output.length>16*1024**2)output=output.slice(-16*1024**2);}});
  let raw;try{raw=JSON.parse(await readFile(reportPath,'utf8'));}catch(error){raw={executionFailure:{stage:'missing_report',code:exit.exitCode,error:error.message,output}};}
  if(published){await mkdir(published,{recursive:true});await writeFile(resolve(published,'execution.json'),JSON.stringify({exitCode:exit.exitCode,output,wallMs:performance.now()-start},null,2));await writeFile(resolve(published,'framework.json'),JSON.stringify(raw,null,2));}
  const config=JSON.parse(await readFile(resolve(workspace,'verification.json'),'utf8'));
  return {...normalizeReport(raw,{framework:config.framework,workspace}),exitCode:exit.exitCode,wallMs:performance.now()-start};
}
export async function createV4Task({directory,descriptor,record,toolchain,gradeDirectory}){
  const validation=JSON.parse(await readFile(resolve(directory,'validation.json'),'utf8'));if(!validation.valid)throw new Error('Original/reference gates required');
  const baseline=validation.baselineDirectory??resolve(directory,'baseline'),dependencies=validation.dependencies;
  const task={id:descriptor.id,category:descriptor.category,kind:'v4-real-heldout',repository:descriptor.repo,revision:descriptor.baseCommit,baseline,baselineHashes:validation.baselineHashes,record,
    sourceFiles:Object.keys(validation.baselineHashes).filter(path=>productionPath(descriptor.repo,path)),referenceFiles:descriptor.productionFiles,
    snapshot:repositorySnapshot,copyWorkspace:copyRepository,allowsChange:path=>allowedAgentChange(descriptor.repo,path),setupWorkspace:workspace=>linkDependencies(workspace,dependencies),
    prompt:'Resolve the upstream engineering issue below. Work in this checkout using the preprovisioned dependencies. The bash tool executes PowerShell 7 with no profile inside an isolated Windows filesystem; external networking is disabled. You may change production code, public tests and documentation. Preserve package metadata, dependency locks, configuration, native-verify.cjs, verification.json and .v4-* verification helpers. Do not install packages or attempt to access other workspaces. Run node native-verify.cjs for the repository-derived public smoke suite; you may run it with --tests-json PATH to test other existing public unit files. Independent grading reconstructs production changes in a pristine checkout and applies held-out upstream tests. Existing public snapshots may predate the requested behavior; do not undo that behavior merely to satisfy old snapshots.\n\n'+record.problem_statement};
  task.verify=async workspace=>{
    const before=validation.baselineHashes,after=await repositorySnapshot(workspace),destination=resolve(gradeDirectory,'independent-grade');await copyRepository(baseline,destination);
    for(const path of new Set([...Object.keys(before),...Object.keys(after)]))if(before[path]!==after[path]&&productionPath(descriptor.repo,path)){
      const target=resolve(destination,path);if(!after[path])await unlink(target);else{await mkdir(resolve(target,'..'),{recursive:true});await cp(resolve(workspace,path),target);}
    }
    const {initializeWorkspaceGit}=await import('../intelligence-eval.mjs');await initializeWorkspaceGit(destination);await linkDependencies(destination,dependencies);
    await applyPatch(destination,record.test_patch,resolve(gradeDirectory,'acceptance.diff'));
    const observed=await runVerification({workspace:destination,toolchain,dependencies,tests:validation.privateTests,published:resolve(gradeDirectory,'grading')});
    const grade=gradeReport(observed,{targets:record.FAIL_TO_PASS,regressions:record.PASS_TO_PASS,expectedInventory:validation.expectedInventory,knownPending:validation.knownPending});
    return {acceptance:{status:grade.accepted?'passed':grade.valid?'failed':'invalid_result',required:record.FAIL_TO_PASS.length,requiredPassed:grade.targetsPassed,unpassed:grade.failures??[],missing:grade.missing??[],v4Grade:grade},regression:{status:grade.regressionsPassed===record.PASS_TO_PASS.length&&grade.valid?'passed':grade.valid?'failed':'invalid_result',required:record.PASS_TO_PASS.length,requiredPassed:grade.regressionsPassed}};
  };
  return {task,validation,dependencies};
}
