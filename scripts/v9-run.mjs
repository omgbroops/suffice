import {executeV9} from '../src/v9/controller.mjs';
const chunks=[];let size=0;
for await(const chunk of process.stdin){size+=chunk.length;if(size>1_000_000)throw Error('Request exceeds 1 MB');chunks.push(chunk);}
const result=await executeV9(JSON.parse(Buffer.concat(chunks).toString('utf8')));
console.log(JSON.stringify({status:result.status,verification:result.verificationStatus,costUsd:result.costUsd,costKnown:result.costKnown,snapshot:result.snapshot}));
if(result.status!=='completed')process.exitCode=1;
