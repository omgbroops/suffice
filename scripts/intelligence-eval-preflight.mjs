import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {resolve} from 'node:path';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,allowModelNetwork:false});
if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription required; no fallback');
const scratch=await mkdtemp(resolve(tmpdir(),'suffice-eval-preflight-')),directory=resolve(import.meta.dirname,'../reports/repository-intelligence-eval-v2');await mkdir(directory,{recursive:true});
const agent=await createSufficeSession({...parseOptions([]),cwd:scratch,home:resolve(scratch,'home'),model:'gpt-6-luna',effort:'xhigh',serviceTier:'priority',maxOutputTokens:256,maxCost:0.10,timeout:90},runtime);
let final,error;try{final=await agent.run('Reply exactly READY. Do not call any tools.');}catch(e){error=e.message;}finally{await agent.dispose();}
const events=(await readFile(agent.eventPath,'utf8')).trim().split('\n').map(JSON.parse),provider=events.filter(e=>e.type==='provider_usage');
const report={requestedModel:'gpt-6-luna',effort:'xhigh',requestedTier:'priority',final,error,usage:agent.totals,requests:events.filter(e=>e.type==='provider_request'),responses:provider,events:agent.eventPath,fastSupported:!error&&provider.some(e=>['priority','fast'].includes(e.serviceTier))};
await writeFile(resolve(directory,'preflight.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
