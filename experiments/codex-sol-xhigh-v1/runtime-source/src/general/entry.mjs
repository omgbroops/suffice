import {createRuntime} from '../runtime.mjs';
import {runGeneralAgent} from './agent.mjs';
let stdin='';for await(const c of process.stdin)stdin+=c;
const config=JSON.parse(stdin);const runtime=await createRuntime();
if(!runtime.getModel('openai','gpt-6.1-sol')||!runtime.isUsingSubscription('openai')||!await runtime.getAuth('openai'))throw new Error('Sol subscription required; no fallback');
console.log(JSON.stringify(await runGeneralAgent({runtime,workspace:'/workspace',prompt:config.prompt,runDir:'/receipts',limits:config.limits,preflight:config.preflight??false})));
