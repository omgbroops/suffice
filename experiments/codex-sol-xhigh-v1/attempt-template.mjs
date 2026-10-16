async function attempt(m,arm){
 await verify();await verifyTask(m);const t=m.task,id=m.id+'-'+arm,run=resolve(A,id);
 if(await exists(resolve(run,'result.json')))return json(resolve(run,'result.json'));
 if(await exists(run))throw Error('Partial attempt retained; inspect before retry '+id);
 const disk=await statfs(ROOT);if(disk.bavail*disk.bsize<1024**3)throw Error('Disk under 1GiB');
 await mkdir(run,{recursive:true});await save(resolve(run,'prompt.json'),{text:m.prompt,sha256:m.promptHash});
 const actor=resolve(DIR,'actors',id),prepared=data('actor',m.taskFile,actor);await save(resolve(run,'initial.json'),prepared);
 if(JSON.stringify(prepared.trackedHashes)!==JSON.stringify(m.baseHashes))throw Error('Initial actor bytes differ');
 const privateRoots=[resolve(ROOT,'research'),resolve(TASKS,m.id,'private')];await mkdir(privateRoots[1],{recursive:true});
 let codexHome=null;if(arm==='codex'){
  codexHome=resolve(run,'worker/codex-home');await mkdir(codexHome,{recursive:true,mode:0o700});
  await copyFile(resolve(ROOT,'.suffice/codex-native-home/auth.json'),resolve(codexHome,'auth.json'));
  await copyFile(resolve(ROOT,'.suffice/codex-native-home/models_cache.json'),resolve(codexHome,'models_cache.json'));
 }
 active++;await event({event:'start',id,arm,active});let execution;
 try{
  const command=arm==='suffice'?['node','/runtime/src/general/entry.mjs']:['node','/native-worker.mjs'];
  execution=await executeIsolated({workspace:actor,receipts:resolve(run,'worker'),command,input:JSON.stringify({prompt:m.prompt,limits}),codexHome,privateRoots,gitMetadata:[resolve(t.baseDir,'.git'),await dependencies(t)],timeoutMs:limits.timeoutMs+10000});
  const events=(await readFile(resolve(run,'worker/events.live.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  const wr=await json(resolve(run,'worker/worker.json'));
  let a=accounting(events);
  if(arm==='codex')a={...a,unknown:wr.usageCostUnknown,matched:wr.recordsMatchedFinalAggregate,requests:null,responses:wr.turns};
  const patch=data('capture',m.taskFile,actor);await save(resolve(run,'patch.json'),patch);
  const diff=spawnSync('git',['-C',linuxPath(actor),'diff','--binary','HEAD'],{encoding:'utf8',maxBuffer:8*1024**2});await writeFile(resolve(run,'tracked.patch'),diff.stdout??'');
  const grading=await grade(m,run,patch),requests=events.filter(e=>e.type==='provider_request');
  const identity=arm==='suffice'?requests.length>0&&requests.every(e=>e.model==='gpt-6.1-sol'&&e.reasoning?.effort==='xhigh'):wr.identity;
  const tools=arm==='suffice'?requests.every(e=>e.tools.length===1&&e.tools[0].name==='codemode'):wr.nativePromptAndToolsUnmodified;
  const calls=events.filter(e=>e.type==='tool_call').length;
  const unknown=a.unknown||execution.outputLimited||!a.matched;
  const eligible=!unknown&&identity&&tools&&a.usage.estimatedApiUsd<=limits.maxCostUsd&&a.responses<=limits.maxTurns&&calls<=limits.maxCalls&&execution.latencyMs<=limits.timeoutMs;
  const status=execution.exitCode!==0||execution.resourceStop?'operational_failure':wr.status;
  const result={id,task:m.id,repository:t.repository,issue:t.issue,cohort:t.cohort,arm,model:'gpt-6.1-sol',effort:'xhigh',firstArm:m.firstArm,status,accepted:grading.accepted&&identity&&tools,budgetEligible:eligible,success:grading.accepted&&eligible,knownEstimatedUsd:a.usage.estimatedApiUsd,totalEstimatedUsd:unknown?null:a.usage.estimatedApiUsd,usage:a.usage,requests:a.requests,turns:a.responses,rawResponses:a.rawResponses,failedResponses:a.failedResponses,receiptsMatched:a.matched,identity,tools,calls,modelVisibleCalls:arm==='suffice'?events.filter(e=>e.type==='tool_call'&&e.name==='codemode').length:calls,primitiveCalls:arm==='suffice'?events.filter(e=>e.type==='tool_call'&&e.name!=='codemode').length:null,nativeCommandExecutions:wr.commandExecutions??null,latencyMs:execution.latencyMs,peakRssBytes:execution.peakRssBytes,resourceStop:execution.resourceStop,grade:grading,patchPaths:patch.map(p=>p.path),codingFailure:status==='completed'&&!grading.accepted,operationalFailure:status!=='completed',errors:wr.errors??[],end:new Date().toISOString()};
  await save(resolve(run,'result.json'),result);await event({event:'end',id,active,status,accepted:result.accepted,cost:result.totalEstimatedUsd});console.log(JSON.stringify({id,status,accepted:result.accepted,cost:result.totalEstimatedUsd}));return result;
 }catch(e){await save(resolve(run,'evaluator-error.json'),{at:new Date().toISOString(),error:String(e.stack),execution:execution?{exitCode:execution.exitCode,latencyMs:execution.latencyMs}:null});await event({event:'error',id,error:String(e.message)});throw e;}finally{active--;}
}
