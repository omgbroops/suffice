// Standalone entry avoids leaking --input-type into codemode subprocesses.
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {executeAccuracyPipeline} from './executor.mjs';

const chunks=[];let bytes=0;
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>1024*1024)throw Error('Request exceeds 1 MiB');chunks.push(chunk);}
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
const runtime=await ModelRuntime.create({authPath:request.authPath??process.env.SUFFICE_AUTH_PATH,modelsPath:null,allowModelNetwork:false});
if(!runtime.isUsingSubscription('openai'))throw Error('OpenAI subscription required; no silent fallback');
const result=await executeAccuracyPipeline({...request,runtime});
console.log(JSON.stringify({status:result.status,profile:result.profile,cost:result.usage.costUnknown?null:result.usage.estimatedApiUsd,stages:result.stages.length,verification:result.verificationStatus,reviewStatus:result.reviewStatus??'not_run',budgetEligible:result.budgetEligible}));
if(!['completed','verification_failed'].includes(result.status))process.exitCode=1;
