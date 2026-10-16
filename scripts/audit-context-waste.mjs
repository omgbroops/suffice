// Offline analysis only. No runtime imports, model calls, or transcript publication.
import {readFile,writeFile,readdir,stat,mkdir} from 'node:fs/promises';
import {resolve,relative,dirname,basename,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {simple} from 'acorn-walk';
import {pathToFileURL} from 'node:url';

const sum=(xs)=>xs.reduce((a,b)=>a+b,0);
const quantile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]:null;
const chars=x=>typeof x==='string'?x.length:JSON.stringify(x??null).length;
const hash=x=>createHash('sha256').update(x).digest('hex');
const normalizedPath=p=>String(p??'').replaceAll('\\','/').replace(/^\.\//,'');
const text=m=>(m.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join('\n');
const countedUsage=['input','cacheRead','cacheWrite','output'];

export function usageOf(messages){
  const seen=new Set(); const usage=Object.fromEntries([...countedUsage,'reasoning','totalTokens'].map(k=>[k,0]));
  const costs={input:0,cacheRead:0,cacheWrite:0,output:0,total:0};
  let calls=0,duplicates=0,unknown=0,zeroUsageErrorCalls=0,identityMismatches=0;
  for(const m of messages){
    if(m.role!=='assistant')continue;
    if(m.responseId&&seen.has(m.responseId)){duplicates++;continue;}
    if(m.responseId)seen.add(m.responseId);
    calls++; const u=m.usage;
    if(!u){unknown++;continue;}
    for(const k of Object.keys(usage))usage[k]+=u[k]??0;
    if(countedUsage.every(k=>Number.isFinite(u[k]))&&sum(countedUsage.map(k=>u[k]))!==u.totalTokens)identityMismatches++;
    if(['error','aborted'].includes(m.stopReason)){unknown++;if(!u.totalTokens)zeroUsageErrorCalls++;}
    if(!Number.isFinite(u.cost?.total))unknown++;
    else for(const k of Object.keys(costs))costs[k]+=u.cost?.[k]??0;
  }
  return {calls,duplicates,unknown,zeroUsageErrorCalls,identityMismatches,usage,costs};
}

export function syntaxOf(code){
  const result={parsed:true,store:0,load:0,parallel:0,emit:0,tools:0,wholeResultEmits:0};
  try{
    const ast=parse(code,{ecmaVersion:'latest',sourceType:'script',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true});
    const returnedToolVariables=new Set();
    const isTool=n=>n?.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.object?.name==='tools';
    simple(ast,{VariableDeclarator(n){if(n.id.type==='Identifier'&&isTool(n.init?.type==='AwaitExpression'?n.init.argument:n.init))returnedToolVariables.add(n.id.name);}});
    simple(ast,{CallExpression(n){
      const c=n.callee;
      if(c.type==='Identifier'&&['store','load'].includes(c.name))result[c.name]++;
      if(c.type==='MemberExpression'&&c.object?.name==='Promise'&&['all','allSettled'].includes(c.property?.name))result.parallel++;
      if(isTool(n))result.tools++;
      if(c.name==='text'||c.type==='MemberExpression'&&c.object?.name==='console'){
        result.emit++;
        for(const a of n.arguments){if(isTool(a?.type==='AwaitExpression'?a.argument:a)||a.type==='Identifier'&&returnedToolVariables.has(a.name))result.wholeResultEmits++;}
      }
    }});
  }catch{result.parsed=false;}
  return result;
}

async function filesUnder(directory,wanted){
  const found=[];
  async function visit(d){
    for(const e of await readdir(d,{withFileTypes:true})){
      if(e.isSymbolicLink()||['workspace','baseline','artifacts','observations','node_modules','exports','export'].includes(e.name))continue;
      const p=resolve(d,e.name);if(e.isDirectory())await visit(p);else if(wanted.includes(e.name))found.push(p);
    }
  }
  await visit(directory);return found.sort();
}

export function repeatReads(events){
  const seen=new Set(); let reads=0,exactRepeats=0,repeatRawCharacters=0;
  for(const e of events){
    if(e.type!=='tool'||e.name!=='file_read')continue;
    reads++;
    const a=e.args??{};
    // The returned-content hash includes revision/numbered source. No assumed freshness.
    if(!e.resultHash)continue;
    const key=JSON.stringify([e.actor??'',normalizedPath(a.path),a.offset??1,a.limit??200,e.resultHash]);
    if(seen.has(key)){exactRepeats++;repeatRawCharacters+=e.resultChars??0;}
    seen.add(key);
  }
  return {reads,exactRepeats,repeatRawCharacters};
}

function overlaps(calls){
  const previous=new Map();let comparableReads=0,overlappingRequests=0,requestedLines=0,previouslyRequestedLines=0;
  for(const c of calls){
    const a=c.arguments??{};
    if(['file_edit','file_write'].includes(c.name)){previous.delete(normalizedPath(a.path));continue;}
    if(c.name!=='file_read'||!['completed','ok'].includes(c.status))continue;
    const key=normalizedPath(a.path),start=a.offset??1,end=start+(a.limit??200)-1;
    const ranges=previous.get(key)??[];let overlap=0;
    for(const [lo,hi] of ranges)overlap+=Math.max(0,Math.min(end,hi)-Math.max(start,lo)+1);
    comparableReads++;requestedLines+=end-start+1;if(overlap){overlappingRequests++;previouslyRequestedLines+=overlap;}
    const sorted=[...ranges,[start,end]].sort((a,b)=>a[0]-b[0]),merged=[];
    for(const r of sorted){const last=merged.at(-1);if(last&&r[0]<=last[1]+1)last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
    previous.set(key,merged);
  }
  return {comparableReads,overlappingRequests,requestedLines,previouslyRequestedLines};
}

async function analyze(entry){
  const file=entry.file,directory=dirname(file),r=JSON.parse(await readFile(file,'utf8'));
  if(!('success' in r))return {excluded:relative(process.cwd(),file),reason:'not an attempt outcome'};
  const all=await filesUnder(directory,['transcript.json','events.jsonl']);
  const transcriptPaths=all.filter(p=>basename(p)==='transcript.json');
  const candidates=all.filter(p=>basename(p)==='events.jsonl');
  // Aggregate execution events already contain child events; do not count both copies.
  const eventPaths=candidates.filter(p=>!candidates.some(q=>q!==p&&dirname(p).startsWith(dirname(q)+sep)));
  const events=(await Promise.all(eventPaths.map(async p=>(await readFile(p,'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l)).map(e=>({...e,actor:e.actor??relative(directory,dirname(p))}))))).flat();
  const metrics={sessions:transcriptPaths.length,toolResultMessages:0,modelVisibleToolCharacters:0,nestedCalls:0,nestedErrors:0,codemodePrograms:0,singleOperationBatches:0,multiOperationBatches:0,noNestedOperationBatches:0,scriptErrors:0,storePrograms:0,loadPrograms:0,parallelPrograms:0,wholeResultEmitPrograms:0,astErrors:0,repeatUnchangedTests:0};
  const errorCategories={},interfaceErrors=[];
  const errorKind=s=>/EISDIR/.test(s)?'directory passed where a file is expected':/schema|validation|must be|invalid.*argument/i.test(s)?'argument or schema':/exactly once|not found|no match|ambiguous|multiple.*match|replacement/i.test(s)?'lookup or edit match':/is not defined|undefined|not a function|cannot read propert|syntaxerror|unexpected token/i.test(s)?'program execution':/budget|limit reached|exhausted|aborted/i.test(s)?'budget or abort':/not permitted|not allowed|only.*files|read-only|immutable/i.test(s)?'scope restriction':/timeout|timed out/i.test(s)?'timeout':'other';
  const turns=[],allMessages=[],readOverlap=[];
  const programs=[]; const resultSizes=[];
  for(const p of transcriptPaths){
    const messages=JSON.parse(await readFile(p,'utf8'));const actor=relative(directory,dirname(p));allMessages.push(...messages);
    let previousContext=null,visibleSinceLast=0,revision=0;const lastTests=new Map(),nested=[];
    for(const m of messages){
      if(m.role==='assistant'){
        const u=m.usage??{},context=sum(['input','cacheRead','cacheWrite'].map(k=>u[k]??0));
        turns.push({actor,turn:turns.filter(t=>t.actor===actor).length+1,freshInput:u.input??null,cachedInput:u.cacheRead??null,output:u.output??null,contextTokens:context||null,contextDelta:previousContext===null||!context?null:context-previousContext,toolCharactersSincePrevious:visibleSinceLast,stopReason:m.stopReason,cost:u.cost?.total??null});
        if(context)previousContext=context;visibleSinceLast=0;
        for(const c of m.content??[])if(c.type==='toolCall'&&c.name==='codemode'){
          const code=typeof c.arguments==='string'?c.arguments:c.arguments?.code??'';
          metrics.codemodePrograms++;const syn=syntaxOf(code);
          metrics.astErrors+=!syn.parsed;metrics.storePrograms+=!!syn.store;metrics.loadPrograms+=!!syn.load;metrics.parallelPrograms+=!!syn.parallel;metrics.wholeResultEmitPrograms+=!!syn.wholeResultEmits;
          programs.push(code);
        }
      }else if(m.role==='toolResult'){
        const size=text(m).length;metrics.toolResultMessages++;metrics.modelVisibleToolCharacters+=size;visibleSinceLast+=size;resultSizes.push(size);
        if(m.toolName==='codemode'){
          metrics.scriptErrors+=!!m.isError;
          if(m.isError){const k=errorKind(text(m));errorCategories[k]=(errorCategories[k]??0)+1;}
          const calls=Array.isArray(m.nestedCalls)?m.nestedCalls:m.nestedCalls?.calls??[];
          metrics.nestedCalls+=calls.length;metrics.noNestedOperationBatches+=calls.length===0;metrics.singleOperationBatches+=calls.length===1;metrics.multiOperationBatches+=calls.length>=2;
          for(const c of calls){
            nested.push(c);metrics.nestedErrors+=['error','failed','blocked','cancelled'].includes(c.status)||!!c.error;
            if(c.status==='error'&&/EISDIR/.test(c.error??''))interfaceErrors.push({tool:c.name,path:c.arguments?.path??null,errorClass:'directory passed where a file is expected'});
            if(['file_edit','file_write'].includes(c.name)&&['completed','ok'].includes(c.status))revision++;
            if(c.name==='test'&&['completed','ok'].includes(c.status)){
              const key=JSON.stringify(c.arguments??{});if(lastTests.get(key)===revision)metrics.repeatUnchangedTests++;lastTests.set(key,revision);
            }
          }
        }
      }
    }
    readOverlap.push(overlaps(nested));
  }
  // Earlier runners saved assistant/tool events without a complete transcript.
  const savedUsage=transcriptPaths.length?usageOf(allMessages):usageOf(events.filter(e=>e.type==='assistant').map(e=>({role:'assistant',...e})));
  const declaredUsage=r.usage??r.execution?.phases?.reduce((acc,p)=>{for(const k of countedUsage)acc[k]+=(p.usage?.[k]??0);return acc;},Object.fromEntries(countedUsage.map(k=>[k,0])));
  let patch=[];try{patch=JSON.parse(await readFile(resolve(directory,'patch.json'),'utf8'));}catch{}
  const changedPaths=(Array.isArray(patch)?patch:[]).filter(p=>p.before!==p.after).map(p=>normalizedPath(p.path));
  const toolSizes={};let pathEvidence=0,pathMatchesLater=0,pathMatchesPatch=0;
  for(let i=0;i<events.length;i++){
    const e=events[i]; const name=e.type==='tool'?e.name:e.type==='navigation'?e.tool:null;
    const size=e.type==='tool'?e.resultChars:e.type==='navigation'?e.characters:null;
    if(name&&Number.isFinite(size)){const b=toolSizes[name]??={calls:0,rawCharacters:0,sizes:[]};b.calls++;b.rawCharacters+=size;b.sizes.push(size);}
    if(['file_read','symbol_read','symbol_references'].includes(name)&&e.args?.path){
      pathEvidence++;const path=normalizedPath(e.args.path);
      if(changedPaths.includes(path))pathMatchesPatch++;
      // Conservative lexical proxy; not a conclusion about cognitive use.
      const later=events.slice(i+1).filter(x=>x.type==='assistant'&&(x.actor===e.actor||!x.actor));
      if(later.some(x=>JSON.stringify(x.content??[]).includes(e.args.path)))pathMatchesLater++;
    }
  }
  for(const v of Object.values(toolSizes)){v.p50=quantile(v.sizes,.5);v.p90=quantile(v.sizes,.9);v.p99=quantile(v.sizes,.99);delete v.sizes;}
  const rel=relative(process.cwd(),file).replaceAll('\\','/');
  const campaign=basename(dirname(directory));
  const hard=['state-screen','state-comparison','postreset-hard','evidence-screen-v1'].includes(campaign);
  const totalCost='totalEstimatedUsd' in r?r.totalEstimatedUsd:'totalCost' in r?r.totalCost:null;
  const knownCost=r.knownEstimatedUsd??r.knownCost??r.usage?.estimatedApiUsd??r.execution?.phases?.reduce((a,p)=>a+(p.usage?.estimatedApiUsd??0),0)??null;
  return {source:rel,root:entry.root,campaign,run:basename(directory),task:r.task??r.id??basename(directory),arm:r.arm??r.variant??r.mode??null,
    status:r.status,success:r.success,patchAccepted:r.patchAccepted??null,budgetEligible:r.budgetEligible??r.withinKnownBudget??null,
    difficulty:hard?'explicit hard screen':'not calibrated',knownCost,totalCost,costKnown:Number.isFinite(totalCost),usage:savedUsage,
    usageMatchesDeclared:declaredUsage?countedUsage.every(k=>(declaredUsage[k]??0)===savedUsage.usage[k]):null,
    metrics,turns,toolSizes,errorCategories,interfaceErrors,readRepeats:repeatReads(events),requestedReadOverlap:Object.fromEntries(Object.keys(readOverlap[0]??{}).map(k=>[k,sum(readOverlap.map(x=>x[k]))])),
    evidenceProxies:{pathEvidence,pathMatchesLater,pathMatchesPatch,interpretation:'A later path mention or changed-path match is only a lexical association; absent matches do not establish wasted or irrelevant evidence.'},
    modelVisibleResultSizes:{p50:quantile(resultSizes,.5),p90:quantile(resultSizes,.9),p99:quantile(resultSizes,.99)},
    sources:[file,...transcriptPaths,...eventPaths].map(p=>relative(process.cwd(),p).replaceAll('\\','/'))};
}

function summarize(rows){
  const u=Object.fromEntries([...countedUsage,'reasoning','totalTokens'].map(k=>[k,sum(rows.map(r=>r.usage.usage[k]))]));
  const costs=Object.fromEntries(['input','cacheRead','cacheWrite','output','total'].map(k=>[k,sum(rows.map(r=>r.usage.costs[k]))]));
  const metrics=Object.fromEntries(Object.keys(rows[0]?.metrics??{}).map(k=>[k,sum(rows.map(r=>r.metrics[k]))]));
  const repeats=Object.fromEntries(['reads','exactRepeats','repeatRawCharacters'].map(k=>[k,sum(rows.map(r=>r.readRepeats[k]))]));
  return {attempts:rows.length,accepted:rows.filter(r=>r.patchAccepted===true).length,acceptanceRecorded:rows.filter(r=>typeof r.patchAccepted==='boolean').length,successes:rows.filter(r=>r.success).length,
    completeCostAttempts:rows.filter(r=>r.costKnown).length,knownCost:sum(rows.map(r=>r.knownCost??0)),meanCompleteCost:rows.some(r=>r.costKnown)?sum(rows.filter(r=>r.costKnown).map(r=>r.totalCost))/rows.filter(r=>r.costKnown).length:null,
    usage:u,costComponents:costs,metrics,readRepeats:repeats,directoryErrorCalls:sum(rows.map(r=>r.interfaceErrors.length)),directoryErrorAttempts:rows.filter(r=>r.interfaceErrors.length).length,usageReconciliationMismatches:rows.filter(r=>r.usageMatchesDeclared===false).length};
}

async function main(){
  const inventory=JSON.parse(await readFile(resolve('.suffice/research/trace-inventory.json'),'utf8'));
  const rows=[],excluded=[],failures=[];
  for(const entry of inventory){try{const row=await analyze(entry);if(row.excluded)excluded.push(row);else rows.push(row);}catch(e){failures.push({source:relative(process.cwd(),entry.file),errorType:e.name,message:e.message.slice(0,100)});}}
  const grouping=f=>Object.fromEntries([...new Set(rows.map(f))].map(k=>[k,summarize(rows.filter(r=>f(r)===k))]));
  const report={at:new Date().toISOString(),mode:'offline; no model/tool programs executed',inventoryRecords:inventory.length,excluded,parseFailures:failures,
    limitations:['Pi input is fresh input: add cacheRead/cacheWrite once. It differs from Codex input_tokens.',
      'No causal attribution of cumulative input dollars to a specific historical tool output. Raw operation sizes and model-visible codemode results are separate.',
      'Requested line overlap overestimates actual overlapping content on short files; symbol reads excluded from that estimate.',
      'Repeated tests without production edits can still be justified by changed test programs or external state.',
      'Missing transcripts imply unknown model-visible output and batching metrics, not zero.',
      'Difficulty is uncalibrated except explicitly identified hard-screen protocols. Cost or length is not task difficulty.',
      'Stored outcomes were authored by the experiments, not regraded here. Heterogeneous tasks/models/budgets cannot be pooled as a controlled comparison.',
      'No counterfactual claim that removed output would preserve subsequent model decisions or correctness. Engineering inference excluded.'],
    overall:summarize(rows),byRoot:grouping(r=>r.root),byCampaign:grouping(r=>r.root+'/'+r.campaign),
    byAcceptance:grouping(r=>r.patchAccepted===true?'accepted':r.patchAccepted===false?'rejected':'acceptance not recorded'),
    byDifficulty:grouping(r=>r.difficulty),byOperationalStatus:grouping(r=>r.status??'not recorded'),
    byObservedEffort:grouping(r=>r.usage.calls<=6?'at most 6 recorded responses':r.usage.calls<12?'7 to 11 recorded responses':'at least 12 recorded responses'),rows};
  await mkdir(resolve('reports'),{recursive:true});
  await writeFile(resolve('reports/CONTEXT-WASTE-AUDIT.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({records:inventory.length,attempts:rows.length,excluded:excluded.length,parseFailures:failures,overall:report.overall,byRoot:report.byRoot},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
