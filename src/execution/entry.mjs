import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {executeStrategy} from './strategies.mjs';
let size=0;const chunks=[];
for await (const c of process.stdin) {size+=c.length;if(size>1024*1024)throw Error('Request exceeds 1 MiB');chunks.push(c);}
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
const runtime=await ModelRuntime.create({authPath:request.authPath??process.env.SUFFICE_AUTH_PATH,modelsPath:null,allowModelNetwork:false});
const result=await executeStrategy({...request,runtime});
console.log(JSON.stringify({strategy:result.strategy,status:result.status,cost:result.usage.costUnknown?null:result.usage.estimatedApiUsd,verification:result.verificationStatus}));
if (!['completed','verification_failed'].includes(result.status)) process.exitCode=1;
