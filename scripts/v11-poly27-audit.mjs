// Offline post-run audit. Never invokes actors, models, graders, or authentication clients.
import {readFile, writeFile, readdir, lstat} from 'node:fs/promises';
import {join, resolve, relative, isAbsolute, sep, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
const project = resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const denied = /^(?:private-auth|auth\.json|credentials?(?:[._-].*)?|secrets?(?:[._-].*)?|\.env(?:\..*)?|\.codex|\.ssh|\.aws|\.gnupg)$/i;
export function assertEvidencePath(path) {if(String(path).replaceAll('\\','/').split('/').some(part=>denied.test(part)))throw Error('Authentication/secret stores are outside audit scope');return path;}
const readEvidence = async (path, ...options) => {assertEvidencePath(path);const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('Audit inputs must be regular files');return readFile(path,...options);};
const read = async path => JSON.parse(await readEvidence(path, 'utf8'));
const digest = async path => hash(await readEvidence(path));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const finite = value => Number.isFinite(value) && value >= 0;
const terminal = new Set(['completed','unverified','verification_failed','operational_failure','infrastructure_error','closure_failure','budget_stopped','cost_unknown','failed','timeout','timed_out','interrupted','cancelled','aborted','overflow','error','unavailable','invalid_result','protocol_failure','policy_violation','source_violation']);
const reviewers = new Set(['test-writer','test-writer-retry','arbiter','verification-recovery']);
export function stagePolicy(role, models, efforts) {
  if (reviewers.has(role)) return {model: models.expert, effort: efforts.advisor, reviewer: true};
  if (['implement','repair'].includes(role)) return {model: models.worker, effort: efforts.worker, reviewer: false};
  if (role === 'takeover') return {model: models.expert, effort: efforts.expert, reviewer: false};
  throw Error('Unrecognized Pi stage role');
}
export function reconcilePiMessage(message, {model, pricing}) {
  const errors = [], usage = {inputTokens: 0, cachedInputTokens: 0, outputTokens: 0};
  if (message.model !== model || message.provider !== 'openai') errors.push('response_identity');
  const u = message.usage;
  if (!u || !['input','output','cacheRead','cacheWrite'].every(key => integer(u[key])) || !finite(u.cost?.total)) return {errors: [...errors,'incomplete_usage'], usage, costUsd: 0, complete: false};
  const inputTokens = u.input + u.cacheRead + u.cacheWrite, longWrite = u.cacheWrite1h ?? 0;
  if (!integer(longWrite) || longWrite > u.cacheWrite) return {errors: [...errors,'invalid_cache_write'], usage, costUsd: 0, complete: false};
  let rates = pricing, threshold = -1;
  for (const tier of pricing?.tiers ?? []) if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > threshold) {rates = tier; threshold = tier.inputTokensAbove;}
  if (!rates || !['input','output','cacheRead','cacheWrite'].every(key => finite(rates[key]))) throw Error('Frozen model rates missing');
  const components = {input: u.input * rates.input / 1e6, output: u.output * rates.output / 1e6, cacheRead: u.cacheRead * rates.cacheRead / 1e6,
    cacheWrite: ((u.cacheWrite - longWrite) * rates.cacheWrite + longWrite * rates.input * 2) / 1e6};
  if (Math.abs(Object.values(components).reduce((sum,n) => sum+n, 0) - u.cost.total) > 1e-9) errors.push('total_cost');
  for (const [key, value] of Object.entries(components)) if (Object.hasOwn(u.cost,key) && Math.abs(value-u.cost[key]) > 1e-9) errors.push(`${key}_cost`);
  return {errors, usage: {inputTokens, cachedInputTokens: u.cacheRead, outputTokens: u.output}, costUsd: u.cost.total, complete: true};
}
const publicContracts = tasks => tasks.map(({workspace,graderDescriptor,...task})=>task);
const rawArm = (execution,grades,strategy) => {
  const attempts=execution.attempts.filter(a=>a.strategy===strategy), ids=new Set(attempts.map(a=>a.id));
  return {strategy,attempts:attempts.length,accepted:grades.filter(g=>ids.has(g.id)&&g.accepted===true).length,
    unknownCosts:attempts.filter(a=>a.costKnown!==true).length,
    costUsd:attempts.every(a=>a.costKnown===true&&finite(a.costUsd))?attempts.reduce((sum,a)=>sum+a.costUsd,0):null};
};
export function pairedChanges(tasks, currentExecution, currentGrades, baselineExecution, baselineGrades) {
  const verdict=(execution,grades,id,strategy)=>grades.find(g=>g.id===execution.attempts.find(a=>a.taskId===id&&a.strategy===strategy)?.id)?.accepted??null;
  const rows=tasks.map(task=>({id:task.id,taskId:task.taskId,
    v10:verdict(baselineExecution,baselineGrades,task.id,'v10'),v11:verdict(currentExecution,currentGrades,task.id,'v11'),
    nativeEarlier:verdict(baselineExecution,baselineGrades,task.id,'native'),nativeFresh:verdict(currentExecution,currentGrades,task.id,'native')}));
  return {rows,gained:rows.filter(r=>r.v10===false&&r.v11===true).length,lost:rows.filter(r=>r.v10===true&&r.v11===false).length,
    stayedPassed:rows.filter(r=>r.v10===true&&r.v11===true).length,stayedFailed:rows.filter(r=>r.v10===false&&r.v11===false).length,
    ungraded:rows.filter(r=>typeof r.v10!=='boolean'||typeof r.v11!=='boolean').length};
}
async function knownComparison(directory,{root,tasks,execution,grades}) {
  const baseline=resolve(directory);if(baseline===root)throw Error('Comparison requires the separate original V10 cohort');
  const names=['plan.json','execution-complete.json','grades.json','summary.json','public-tasks.json'], buffers=await Promise.all(names.map(name=>readEvidence(join(baseline,name))));
  const [plan,oldExecution,oldGrades,summary,oldTasks]=buffers.map(bytes=>JSON.parse(bytes)),{fingerprint,...body}=plan;
  if(hash(JSON.stringify(body))!==fingerprint||oldExecution.closed!==true||oldExecution.attempts?.length!==54||oldGrades.grades?.length!==54||oldExecution.planSha256!==hash(buffers[0])||oldGrades.planSha256!==hash(buffers[0])||oldGrades.executionSha256!==hash(buffers[1]))throw Error('Original V10 comparison anchors are incomplete or changed');
  if(JSON.stringify(publicContracts(tasks))!==JSON.stringify(publicContracts(oldTasks)))throw Error('Comparison public contracts differ; cannot label it the same suite');
  const origin=await read(join(root,'cohort-origin.json'));if(origin.baselinePlanSha256!==hash(buffers[0]))throw Error('Comparison differs from the prepared original cohort');
  const arms=['v10','native'].map(strategy=>rawArm(oldExecution,oldGrades.grades,strategy));
  for(const arm of arms){const stored=summary.arms.find(row=>row.strategy===arm.strategy);if(!stored||stored.accepted!==arm.accepted||stored.costKnown&&Math.abs(stored.costUsd-arm.costUsd)>1e-9)throw Error('Original V10 summary disagrees with its sealed rows');}
  return {label:'Same 27 known development exercises, unchanged public contracts; not held-out evidence or a SWE-bench Pro score',
    evidence:names.map((name,i)=>({path:join(baseline,name),sha256:hash(buffers[i])})),originalArms:arms,
    currentArms:['v11','native'].map(strategy=>rawArm(execution,grades,strategy)),changes:pairedChanges(tasks,execution,grades,oldExecution,oldGrades.grades),
    interpretation:'Original runs are referenced, never modified or regraded. Fresh native results are stochastic; one replay does not establish generalization or a causal improvement.'};
}
const csvCell=value=>{const text=value===null||value===undefined?'':String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;};

export async function auditCohort(directory, {baselineDirectory, writeOutput = true} = {}) {
const root = resolve(directory);
const issues = [], incomplete = [], rows = [], toolCounts = {}, internalProtectionNotes = [];
const identities = {nativePerResponseProven: 0, nativeNoPerResponseProof: 0, piMessages: 0};
const counters = {attemptsExpected: 54, sourceInventoriesExpected: 0, sourceInventoriesVerified: 0, nativeAttemptsExpected: 0, nativeReceiptsReparsed: 0, nativeUsageReconciled: 0,
  piAttemptsExpected: 0, piAttemptsReconciled: 0, piStagesExpected: 0, piStagesReconciled: 0, piMessagesWithCompleteUsage: 0, knownCostAttemptsReconciled: 0, unknownCostAttempts: 0,
  candidateGradesExpected: 54, candidateGradeReceiptsVerified: 0, referenceGradeReceiptsVerified: 0};
const issue = (code, detail) => issues.push({code, detail});
const missing = (code, detail) => {incomplete.push({code, detail}); issue(code, detail);};
const finite = value => Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const same = (a, b, label) => {const good = finite(a) && finite(b) && Math.abs(a - b) <= 1e-9; if (!good) issue('numeric_mismatch', label); return good;};
const equal = (a, b, label) => {const good = JSON.stringify(a) === JSON.stringify(b); if (!good) issue('value_mismatch', label); return good;};
const safePath = path => typeof path === 'string' && path && !isAbsolute(path) && !/[\\:\0\r\n]/.test(path) && !path.split('/').some(p => ['', '.', '..', '.git'].includes(p));
const within = (directory, path) => {const rel = relative(directory, path); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);};
async function exactFiles(directory, prefix = '') {
  const own = await lstat(directory); if (!own.isDirectory() || own.isSymbolicLink()) throw Error('Sealed source root/directory is not regular');
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (!safePath(path)) throw Error('Unsafe sealed source path');
    const full = join(directory, entry.name), stat = await lstat(full);
    if (stat.isSymbolicLink()) throw Error('Sealed source contains a link');
    if (stat.isDirectory()) files.push(...await exactFiles(full, path));
    else if (stat.isFile()) files.push(path); else throw Error('Sealed source contains a special file');
  }
  return files.sort();
}
const executionPath = join(root, 'execution-complete.json'), executionBytes = await readEvidence(executionPath), execution = JSON.parse(executionBytes);
if (execution.closed !== true || execution.attempts?.length !== 54 || new Set(execution.attempts.map(row=>row.id)).size !== 54 || execution.attempts.some(row=>!terminal.has(row.status))) throw Error('Audit waits for all 54 terminal actors to close');
const gradesBytes = await readEvidence(join(root, 'grades.json')), grades = JSON.parse(gradesBytes);
if (grades.grades?.length !== 54 || new Set(grades.grades.map(row=>row.id)).size !== 54 || execution.attempts.some(row=>!grades.grades.some(grade=>grade.id===row.id))) throw Error('Audit waits for all 54 candidate grading rows');
// These files exist only after all candidate grading has finished; this audit never starts it.
const [planBytes, summaryBytes] = await Promise.all(['plan.json', 'summary.json'].map(path => readEvidence(join(root, path))));
const plan = JSON.parse(planBytes), summary = JSON.parse(summaryBytes), started = await read(join(root, 'execution-started.json'));
const {fingerprint, ...planBody} = plan;
equal(hash(JSON.stringify(planBody)), fingerprint, 'plan fingerprint');
for (const value of [execution.planSha256, grades.planSha256, started.planSha256]) equal(value, hash(planBytes), 'plan SHA256 anchor');
for (const value of [execution.planFingerprint, started.planFingerprint]) equal(value, fingerprint, 'plan fingerprint anchor');
equal(grades.executionSha256, hash(executionBytes), 'graded execution SHA256');
equal(grades.graderImage, plan.graderImage, 'grader image');
for (const file of [...plan.runtimeFiles, ...plan.evaluationFiles]) if (await digest(file.path) !== file.sha256) issue('frozen_input_changed', file.path);
const frozen = new Map(plan.runtimeFiles.map(file=>[resolve(file.path),file.sha256]));
for (const path of ['src/v9/workspace.mjs','src/v11/config.mjs','scripts/v11-poly27-evaluate.mjs','src/bench/native-codex.mjs']) {
  const full = resolve(project,path); if (frozen.get(full) !== await digest(full)) issue('audit_dependency_not_pinned',path);
}
if (issues.length) throw Error('Frozen protocol checks failed: ' + JSON.stringify(issues));
const {treeHash} = await import(pathToFileURL(resolve(project, 'src/v9/workspace.mjs')));
const {summarizeCohort, authenticatedVerdict} = await import(pathToFileURL(resolve(project, 'scripts/v11-poly27-evaluate.mjs')));
const {parseNativeEvents} = await import(pathToFileURL(resolve(project, 'src/bench/native-codex.mjs')));
const {MODELS, EFFORTS} = await import(pathToFileURL(resolve(project, 'src/v11/config.mjs')));
equal(plan.models.worker, MODELS.worker, 'plan worker versus frozen config'); equal(plan.models.expert, MODELS.expert, 'plan expert versus frozen config');
const efforts = {...EFFORTS, ...plan.efforts, native: plan.efforts?.native ?? EFFORTS.expert};
const tasks = await read(join(root, 'public-tasks.json')), validation = await read(join(root, 'reference-validation.json'));
if(tasks.length!==27||new Set(tasks.map(task=>task.id)).size!==27||validation.valid!==true||validation.tasks?.length!==27)throw Error('All 27 distinct tasks require the original reference validation');
if (new Set(execution.attempts.map(a => a.id)).size !== 54 || plan.schedule?.length !== 54 || new Set(plan.schedule.map(a => a.id)).size !== 54) issue('attempt_identity', 'Duplicate/missing scheduled attempts');
if (grades.grades?.length !== 54 || new Set(grades.grades.map(a => a.id)).size !== 54) issue('grade_identity', 'Duplicate/missing candidate grades');
for (const item of plan.schedule ?? []) {
  const a = execution.attempts.find(a => a.id === item.id); if (!a || ['taskId', 'strategy', 'repeat'].some(k => a[k] !== item[k])) issue('attempt_identity', item.id);
}
async function graderEvidence(receiptPath,receipt,task,mode,expectedTests) {
  if(!receipt.evidenceFiles?.length)throw Error('Grader evidence inventory is missing');
  const directory=dirname(receiptPath);
  equal(receipt.hostDriverSha256,frozen.get(resolve(project,'scripts/v11-poly27-evaluate.mjs')),task.id+' '+mode+' pinned grading driver');
  for(const file of receipt.evidenceFiles){if(!isAbsolute(file.path)||!within(directory,resolve(file.path)))throw Error('Grader evidence escaped its receipt directory');if(await digest(file.path)!==file.sha256)issue('grader_evidence_changed',task.id+' '+mode+' '+file.path);}
  const resultPath=join(directory,'results/result.json');
  if(!receipt.evidenceFiles.some(file=>resolve(file.path)===resolve(resultPath)))throw Error('Grader result bytes are not authenticated');
  equal(await read(resultPath),receipt.result,task.id+' '+mode+' result bytes versus embedded receipt');
  equal(receipt.image,plan.graderImage,task.id+' '+mode+' image');
  return authenticatedVerdict(receipt.result,receipt.process,{task,mode,expectedTests});
}
for(const validated of validation.tasks){
  const task=tasks.find(task=>task.id===validated.id);if(!task||!integer(validated.expectedTests)||validated.expectedTests===0){issue('invalid_reference_identity',validated.id);continue;}
  for(const mode of ['baseline','gold'])try{
    const before=issues.length,receipt=await read(validated[mode].receiptPath);
    equal(receipt,validated[mode],task.id+' '+mode+' frozen validation receipt');
    const verdict=await graderEvidence(validated[mode].receiptPath,receipt,task,mode,undefined);
    equal(verdict.accepted,mode==='gold',task.id+' '+mode+' authentic acceptance');
    if(mode==='gold')equal(receipt.result?.counts?.tests,validated.expectedTests,task.id+' canonical expected tests');
    if(issues.length===before)counters.referenceGradeReceiptsVerified++;
  }catch(error){missing('reference_grade_evidence_incomplete',validated.id+' '+mode+': '+error.message);}
}
async function sourceInventory(a, result) {
  counters.sourceInventoriesExpected++; const began = issues.length;
  const sourceFiles = await read(join(a.attemptPath, 'source-files.json')), directory = resolve(a.attemptPath, 'sealed-source'), tree = new Map(), folded = new Set();
  if (!Array.isArray(sourceFiles) || !sourceFiles.length) throw Error('Source inventory missing');
  for (const f of sourceFiles) {
    if (!safePath(f.path) || tree.has(f.path) || folded.has(f.path.toLowerCase()) || !integer(f.bytes) || !Number.isSafeInteger(f.mode) || f.mode < 0 || f.mode > 0o777 || !/^[a-f0-9]{64}$/.test(f.sha256)) throw Error('Unsafe, duplicate or invalid source inventory entry');
    folded.add(f.path.toLowerCase());
    const path = resolve(directory, f.path); if (!within(directory, path)) throw Error('Source inventory escaped its directory');
    const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw Error('Source inventory target is not a regular file');
    const bytes = await readEvidence(path); if (bytes.length !== f.bytes || hash(bytes) !== f.sha256) issue('source_content_mismatch', a.id + ' ' + f.path);
    tree.set(f.path, {bytes, mode: f.mode});
  }
  equal([...tree.keys()].sort(), await exactFiles(directory), a.id + ' exact source membership');
  equal(treeHash(tree), a.sourceHash, a.id + ' source tree including declared Linux modes');
  if (issues.length === began) {counters.sourceInventoriesVerified++; result.sourceFiles = tree.size; result.sourceVerified = true;}
}
async function nativeUsage(a, result) {
  counters.nativeAttemptsExpected++; const began = issues.length, dir = join(a.attemptPath, 'actor');
  let receipt, raw;
  try {receipt = await read(join(dir, 'receipt.json')); raw = await readEvidence(join(dir, 'events.jsonl'), 'utf8');}
  catch (error) {missing('native_raw_evidence_missing', a.id + ': ' + error.message); return;}
  equal(receipt.model, plan.models.native, a.id + ' native requested model'); equal(receipt.effort, efforts.native, a.id + ' native requested effort');
  if (!receipt.process || !['exitCode', 'timedOut', 'aborted', 'overflow', 'error'].every(k => Object.hasOwn(receipt.process, k))) missing('native_process_metadata_missing', a.id);
  const parsed = parseNativeEvents(raw, {...receipt.process, model: plan.models.native, pricing: plan.pricing[plan.models.native]}); counters.nativeReceiptsReparsed++;
  identities[parsed.modelIdentity.perResponseProof ? 'nativePerResponseProven' : 'nativeNoPerResponseProof']++;
  equal(parsed.modelIdentity, receipt.modelIdentity, a.id + ' raw native model evidence');
  if (parsed.modelIdentity.observed.some(model => model !== plan.models.native)) issue('native_observed_model_mismatch', a.id);
  equal(parsed.usage, receipt.usage, a.id + ' native receipt raw usage'); equal(parsed.rawUsage, receipt.rawUsage, a.id + ' native aggregate events');
  same(parsed.toolCalls, receipt.toolCalls, a.id + ' native tool count'); result.toolCalls = parsed.toolCalls;
  if (receipt.dispatched === false) {
    if (parsed.userTurns.started !== 0) issue('native_dispatch_mismatch', a.id);
    equal(a.costKnown, true, a.id + ' undispatched known cost'); same(a.costUsd, 0, a.id + ' undispatched zero cost');
    result.usageReconciled = issues.length === began; if (result.usageReconciled) {counters.nativeUsageReconciled++; counters.knownCostAttemptsReconciled++;} return;
  }
  let finalMatches = false;
  try {const final = await readEvidence(join(dir, 'final.txt'), 'utf8'); finalMatches = final.replace(/\r?\n$/, '') === parsed.final.replace(/\r?\n$/, '');}
  catch (error) {missing('native_final_missing', a.id + ': ' + error.message);}
  if (parsed.valid && !finalMatches) issue('native_final_mismatch', a.id);
  if (parsed.rawUsage.length !== 1 || !parsed.usageReconciled) missing('native_usage_incomplete', a.id + ': ' + (parsed.error ?? 'No complete validated aggregate'));
  equal(parsed.valid, receipt.valid, a.id + ' native receipt validity'); equal(parsed.status, receipt.status, a.id + ' native receipt status');
  equal(parsed.costKnown, receipt.costKnown, a.id + ' native receipt known-cost status'); equal(receipt.costKnown, a.costKnown, a.id + ' native attempt known-cost status');
  equal(parsed.usage, a.usage, a.id + ' native attempt raw tokens');
  if (a.costKnown) {same(parsed.costUsd, receipt.costUsd, a.id + ' native receipt cost'); same(parsed.costUsd, a.costUsd, a.id + ' native attempt cost');}
  else {equal(a.costUsd, null, a.id + ' unknown native cost stays null'); counters.unknownCostAttempts++;}
  same(parsed.knownCostFloorUsd, a.knownCostFloorUsd, a.id + ' native known floor');
  result.usageReconciled = issues.length === began && parsed.usageReconciled;
  if (result.usageReconciled) {counters.nativeUsageReconciled++; if (a.costKnown) counters.knownCostAttemptsReconciled++;}
  result.nativeParseStatus = parsed.status; result.nativePerResponseModelProof = parsed.modelIdentity.perResponseProof;
}
async function piUsage(a, result) {
  counters.piAttemptsExpected++; const began = issues.length, dir = join(a.attemptPath, 'actor'); let stages;
  try {stages = await read(join(dir, 'stages.json')); if (!Array.isArray(stages) || !stages.length) throw Error('No recorded stages');}
  catch (error) {missing('pi_stages_missing', a.id + ': ' + error.message); return;}
  const aggregate = {inputTokens: 0, cachedInputTokens: 0, outputTokens: 0}; let floor = 0;
  const actor = await read(join(a.attemptPath, 'actor-result.json'));
  equal(actor.costKnown,a.costKnown,a.id+' controller/attempt known cost');
  equal(actor.usage,a.usage,a.id+' controller/attempt raw token total');
  equal(actor.status,a.status,a.id+' controller/attempt status');
  equal(actor.costUsd,a.costUsd,a.id+' controller/attempt cost');
  equal(actor.knownCostFloorUsd,a.knownCostFloorUsd,a.id+' controller/attempt cost floor');
  result.verificationStatus=actor.verificationStatus??null;result.clarification=actor.clarification??null;
  result.verificationNotes=(actor.notes??[]).filter(note=>note.kind!=='protected_checks_restored');
  equal(actor.stages, stages, a.id + ' complete controller stage inventory');
  const expectedFolders=stages.map((stage,i)=>`stage-${i+1}-${stage.role}`).sort();
  const observedFolders=(await readdir(dir,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&/^stage-/.test(entry.name)).map(entry=>entry.name).sort();
  equal(observedFolders,expectedFolders,a.id+' exact stage folder inventory');
  for(const [field,role] of Object.entries({writerRetries:'test-writer-retry',verificationRecoveries:'verification-recovery',repairs:'repair',takeovers:'takeover'})){
    const count=stages.filter(stage=>stage.role===role).length;
    equal(a[field]??0,count,a.id+' scheduled '+field);equal(actor[field]??0,count,a.id+' controller '+field);result[field]=count;
  }
  const restorations = (actor.notes ?? []).filter(n => n.kind === 'protected_checks_restored');
  equal(actor.policyEligible,restorations.length===0,a.id+' controller restoration eligibility');
  equal(a.controllerPolicyEligible,actor.policyEligible,a.id+' sealed controller eligibility');
  equal(a.controllerPolicyViolations,actor.policyViolations,a.id+' sealed controller restoration notes');
  equal(actor.policyViolations,restorations,a.id+' controller notes versus policy violations');
  if (restorations.length) internalProtectionNotes.push({id: a.id, taskId: a.taskId, status: a.status, storedPolicyValid: a.policyValid, notes: restorations});
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i], stageBegan = issues.length; counters.piStagesExpected++;
    let policy;try{policy=stagePolicy(s.role,plan.models,efforts);}catch{issue('pi_unknown_stage',a.id+' '+s.role);continue;}
    const {reviewer,model,effort}=policy;
    equal(s.model, model, a.id + ' ' + s.role + ' requested model'); equal(s.effort, effort, a.id + ' ' + s.role + ' requested effort');
    if (reviewer) same(s.toolCalls, 0, a.id + ' reviewer tool calls');
    const folder = join(dir, `stage-${i + 1}-${s.role}`); let events, receipt;
    try {events = (await readEvidence(join(folder, 'events.jsonl'), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); receipt = await read(join(folder, 'receipt.json'));}
    catch (error) {missing('pi_stage_raw_evidence_missing', a.id + ' ' + s.role + ': ' + error.message); continue;}
    for (const key of ['role', 'model', 'effort', 'costKnown', 'costUsd', 'knownCostFloorUsd', 'usage']) equal(receipt[key], s[key], a.id + ' stage receipt ' + key);
    const messages = events.filter(e => e.type === 'assistant'), totals = {inputTokens: 0, cachedInputTokens: 0, outputTokens: 0}; let cost = 0;
    if (!messages.length) missing('pi_stage_messages_missing', a.id + ' ' + s.role);
    for (const m of messages) {
      identities.piMessages++;
      const reconciled=reconcilePiMessage(m,{model,pricing:plan.pricing[model]});
      for(const code of reconciled.errors)issue('pi_message_'+code,a.id+' '+s.role);
      if(!reconciled.complete){missing('pi_message_usage_incomplete',a.id+' '+s.role);continue;}
      counters.piMessagesWithCompleteUsage++;
      cost+=reconciled.costUsd;for(const key of Object.keys(totals))totals[key]+=reconciled.usage[key];
    }
    if (s.costKnown) same(cost, s.costUsd, a.id + ' stage cost');
    else equal(s.costUsd, null, a.id + ' unknown stage cost stays null');
    same(cost, s.knownCostFloorUsd, a.id + ' stage known floor'); floor += cost;
    for (const key of Object.keys(aggregate)) {same(totals[key], s.usage?.[key], a.id + ' stage ' + key); aggregate[key] += totals[key];}
    for (const event of events) if (event.type === 'navigation') toolCounts[event.tool] = (toolCounts[event.tool] ?? 0) + 1;
    if (issues.length === stageBegan) counters.piStagesReconciled++;
  }
  for (const key of Object.keys(aggregate)) same(aggregate[key], a.usage?.[key], a.id + ' total ' + key);
  same(floor, a.knownCostFloorUsd, a.id + ' total known floor');
  if (a.costKnown) {same(floor, a.costUsd, a.id + ' total V11 cost'); equal(stages.every(s => s.costKnown === true), true, a.id + ' stage known-cost consistency');}
  else {equal(a.costUsd, null, a.id + ' unknown V11 cost stays null'); counters.unknownCostAttempts++;}
  result.stages = stages.length; result.usageReconciled = issues.length === began;
  if (result.usageReconciled) {counters.piAttemptsReconciled++; if (a.costKnown) counters.knownCostAttemptsReconciled++;}
}
for (const a of execution.attempts) {
  const result = {id: a.id, strategy: a.strategy, status: a.status, costKnown: a.costKnown, costUsd: a.costUsd, usageReconciled: false, sourceVerified: false};
  try {
    if (a.patchSha256) {if (await digest(a.patchPath) !== a.patchSha256) issue('patch_changed', a.id);} else missing('patch_unsealed', a.id);
    if (a.sourceHash) await sourceInventory(a, result); else missing('source_unsealed', a.id);
  } catch (error) {missing('source_verification_incomplete', a.id + ': ' + error.message);}
  if (a.cleanup?.safeToContinue !== true) issue('unsafe_cleanup', a.id);
  equal(a.policyValid,a.status==='completed'&&a.cleanup?.safeToContinue===true&&(a.protectionViolations??[]).length===0&&a.actorLatencyMs<=plan.timeoutMs,a.id+' frozen outer policy');
  try {if (a.strategy === 'native') await nativeUsage(a, result); else if (a.strategy === 'v11') await piUsage(a, result); else issue('unknown_strategy', a.id);}
  catch (error) {missing('usage_verification_incomplete', a.id + ': ' + error.message);}
  rows.push(result);
}
for (const grade of grades.grades) {
  const began = issues.length, a = execution.attempts.find(a => a.id === grade.id), task = tasks.find(t => t.id === a?.taskId), validated = validation.tasks.find(t => t.id === a?.taskId);
  try {
    if (!a || !task || !validated) throw Error('Candidate task identity missing');
    equal(grade.taskId, a.taskId, grade.id + ' graded task'); equal(grade.strategy, a.strategy, grade.id + ' graded strategy');
    if (!grade.receiptPath) {missing('candidate_grade_unverified', grade.id + ': ' + grade.reason); continue;}
    const receipt = await read(grade.receiptPath);
    equal(receipt.image, plan.graderImage, grade.id + ' candidate grader image'); equal(receipt.patchSha256, a.patchSha256, grade.id + ' candidate patch');
    const verdict = await graderEvidence(grade.receiptPath,receipt,task,'candidate',validated.expectedTests);
    equal(verdict.accepted, grade.accepted, grade.id + ' independently authenticated candidate verdict');
    equal(verdict.status, grade.status, grade.id + ' independently authenticated candidate status');
    equal(grade.expectedTests, validated.expectedTests, grade.id + ' frozen expected tests');
    if (issues.length === began) counters.candidateGradeReceiptsVerified++;
  } catch (error) {missing('candidate_grade_evidence_incomplete', grade.id + ': ' + error.message);}
}
const completion = await read(join(root, 'evaluation', 'grading-complete.json'));
equal(completion.gradesSha256, hash(gradesBytes), 'completed grade artifact digest'); equal(completion.summarySha256, hash(summaryBytes), 'completed summary artifact digest');
equal(completion.executionSha256,hash(executionBytes),'completed execution artifact digest');equal(completion.planSha256,hash(planBytes),'completed plan artifact digest');
const recomputed = summarizeCohort(execution, grades.grades); equal(summary.arms, recomputed.arms, 'summary arms recomputation'); equal(summary.paired, recomputed.paired, 'summary pairs recomputation');
const independentPairs = {bothPass: 0, v11Only: 0, nativeOnly: 0, bothFail: 0, ungraded: 0};
const taskPairs = plan.tasks.map(task => {
  const pair = {taskId: task.taskId, id: task.id};
  for (const strategy of ['v11', 'native']) {
    const attempts = execution.attempts.filter(a => a.taskId === task.id && a.strategy === strategy);
    if (attempts.length !== 1) issue('pair_identity', task.id + ' ' + strategy);
    const a = attempts[0], g = grades.grades.find(g => g.id === a?.id); pair[strategy] = g?.accepted;
  }
  const {v11, native} = pair; independentPairs[typeof v11 !== 'boolean' || typeof native !== 'boolean' ? 'ungraded' : v11 && native ? 'bothPass' : v11 ? 'v11Only' : native ? 'nativeOnly' : 'bothFail']++;
  return pair;
});
equal(independentPairs, summary.paired, 'independent 27-pair count');
const independentArms = ['v11', 'native'].map(strategy => {
  const attempts = execution.attempts.filter(a => a.strategy === strategy), scores = grades.grades.filter(g => g.strategy === strategy);
  const accepted = scores.filter(g => g.accepted === true), total = attempts.reduce((sum, a) => sum + (a.costKnown ? a.costUsd : a.knownCostFloorUsd ?? 0), 0);
  const arm = {strategy, accepted: accepted.length, graded: scores.filter(g => typeof g.accepted === 'boolean').length, knownCostFloorUsd: total,
    frozenPolicyValidAccepted: accepted.filter(g => attempts.find(a => a.id === g.id)?.policyValid === true).length,
    postrunZeroAnyRestorationAccepted: accepted.filter(g => {const a = attempts.find(a => a.id === g.id); return a?.policyValid === true && !a.protectionViolations?.length && !internalProtectionNotes.some(note => note.id === g.id);}).length};
  const stored = summary.arms.find(arm => arm.strategy === strategy); same(total, stored.knownCostFloorUsd, strategy + ' independent cost total'); same(arm.accepted, stored.accepted, strategy + ' independent acceptances'); same(arm.frozenPolicyValidAccepted, stored.policyValidAccepted, strategy + ' frozen completion metric');
  return arm;
});
for(const arm of independentArms)equal(arm.postrunZeroAnyRestorationAccepted,summary.arms.find(row=>row.strategy===arm.strategy)?.strictPolicyValidAccepted,arm.strategy+' stricter restoration metric');
const comparison=baselineDirectory?await knownComparison(baselineDirectory,{root,tasks,execution,grades:grades.grades}):null;
const taskRows=tasks.map(task=>{
  const cell={task_id:task.taskId};
  for(const strategy of ['v11','native']){
    const attempt=execution.attempts.find(a=>a.taskId===task.id&&a.strategy===strategy),grade=grades.grades.find(g=>g.id===attempt?.id);
    Object.assign(cell,{[strategy+'_accepted']:grade?.accepted,[strategy+'_status']:attempt?.status,[strategy+'_cost_usd']:attempt?.costKnown?attempt.costUsd:null,[strategy+'_actor_ms']:attempt?.actorLatencyMs,
      [strategy+'_policy_outer']:attempt?.policyValid,[strategy+'_policy_strict']:attempt?.policyValid===true&&attempt?.controllerPolicyEligible!==false});
    if(strategy==='v11')for(const key of ['writerRetries','verificationRecoveries','repairs','takeovers'])cell[key]=attempt?.[key]??0;
  }
  const earlier=comparison?.changes.rows.find(row=>row.id===task.id);cell.v10_accepted=earlier?.v10;cell.native_earlier_accepted=earlier?.nativeEarlier;return cell;
});
const columns=Object.keys(taskRows[0]),csv=columns.join(',')+'\n'+taskRows.map(row=>columns.map(key=>csvCell(row[key])).join(',')).join('\n')+'\n';
const stateCounts=Object.fromEntries(['v11','native'].map(strategy=>[strategy,Object.fromEntries([...new Set(execution.attempts.filter(a=>a.strategy===strategy).map(a=>a.status))].map(status=>[status,execution.attempts.filter(a=>a.strategy===strategy&&a.status===status).length]))]));
const rawUsageComplete = rows.length === 54 && rows.every(row => row.usageReconciled) && counters.nativeReceiptsReparsed === counters.nativeAttemptsExpected && counters.piStagesReconciled === counters.piStagesExpected;
const audit = {at: new Date().toISOString(), passed: issues.length === 0, issues, incomplete, attempts: rows.length, planSha256: hash(planBytes), executionSha256: hash(executionBytes), gradesSha256: hash(gradesBytes),
  scriptSha256: await digest(fileURLToPath(import.meta.url)), counters, identities, toolCounts, rawUsageComplete, rawUsageReconciled: rawUsageComplete,
  evidenceScopes: {effort: 'Requested effort checked against the frozen config/plan and client receipts; provider-response effort is not independently observable.',
    modes: 'Exact regular-file content membership and digests verified. Recorded Linux permission modes are validated and included in treeHash; Windows host filesystem modes are not claimed as independently reproduced.',
    pricing: 'Pi per-message catalog pricing including highest eligible tier; native aggregate base-rate estimate retains the existing long-context/cache-write limitations.'},
  internalProtectionNotes,stateCounts,unverified:rows.filter(row=>row.status==='unverified'),summary:recomputed,comparison,taskCsvSha256:hash(csv),taskRows:taskRows.length,rows};
const review={at:audit.at,passed:audit.passed,auditSha256:hash(JSON.stringify(audit,null,2)+'\n'),scriptSha256:audit.scriptSha256,planSha256:audit.planSha256,executionSha256:audit.executionSha256,gradesSha256:audit.gradesSha256,
  counters,identities,rawUsageComplete,independentArms,independentPairs,taskPairs,stateCounts,unverified:audit.unverified,internalProtectionNotes,comparison,taskCsvSha256:audit.taskCsvSha256,findings:issues,evidenceScopes:audit.evidenceScopes,
  interpretation:['Known 27-task development replay, not held-out or SWE-bench Pro accuracy.','Raw canonical acceptance stays separate from the frozen outer policy and supplemental zero-any-restoration count.','Writer retries and verification recovery are public-spec checks, not access to private candidate grading.']};
if(writeOutput){
  const outputs=[['audit.json',JSON.stringify(audit,null,2)+'\n'],['audit-review.json',JSON.stringify(review,null,2)+'\n'],['task-results.csv',csv]];
  for(const [name] of outputs)try{await lstat(join(root,name));throw Error('Audit outputs already exist; preserve them before an explicit rerun');}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [name,bytes]of outputs)await writeFile(join(root,name),bytes,{flag:'wx'});
}
return {audit,review,csv};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,baseline,extra]=process.argv.slice(2);if(!root||extra)throw Error('Usage: node scripts/v11-poly27-audit.mjs <closed-cohort-root> [original-v10-cohort-root]');
 auditCohort(root,{baselineDirectory:baseline}).then(({audit})=>{console.log(JSON.stringify({passed:audit.passed,counters:audit.counters,issues:audit.issues}));if(!audit.passed)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
