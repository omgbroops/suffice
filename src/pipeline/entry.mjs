// Standalone entry: Node child processes must not inherit --input-type.
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {executePipeline} from './executor.mjs';
import {executeFleet} from './fleet.mjs';
const chunks=[];let bytes=0;
for await(const c of process.stdin){bytes+=c.length;if(bytes>1024*1024)throw Error('Request exceeds 1 MiB');chunks.push(c);}
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
const runtime=await ModelRuntime.create({authPath:request.authPath??process.env.SUFFICE_AUTH_PATH,modelsPath:null,allowModelNetwork:false});
if(!runtime.isUsingSubscription('openai'))throw Error('OpenAI subscription required; no silent fallback');
const result=await (request.mode==='fleet'?executeFleet:executePipeline)({...request,runtime});
console.log(JSON.stringify({status:result.status,profile:result.profile??'fleet',cost:result.usage.costUnknown?null:result.usage.estimatedApiUsd,stages:result.stages?.length,verification:result.verificationStatus}));
if(!['completed','verification_failed'].includes(result.status))process.exitCode=1;
