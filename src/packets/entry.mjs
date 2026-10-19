// Standalone entrypoint: never use --input-type; codemode creates Node children.
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {executeTask} from './executor.mjs';
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
await mkdir(request.runDir,{recursive:true});
const runtime=await ModelRuntime.create({authPath:request.authPath??process.env.SUFFICE_AUTH_PATH,modelsPath:null,allowModelNetwork:false});
if(!runtime.isUsingSubscription('openai'))throw Error('OpenAI subscription required; no silent provider fallback');
const result=await executeTask({...request,runtime});
console.log(JSON.stringify({mode:result.mode,status:result.status,cost:result.usage.costUnknown?null:result.usage.estimatedApiUsd,packets:result.packetStages}));
if(result.status!=='completed')process.exitCode=1;
