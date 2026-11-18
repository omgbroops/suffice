// Fake provider for Best-of-N tests: edits the worktree it runs in and prints a run result.
import {writeFileSync} from 'node:fs';
const model=process.env.COMPARE_MODEL;
if(process.env.COMPARE_DELAY)await new Promise(resolve=>setTimeout(resolve,Number(process.env.COMPARE_DELAY)));
if(model==='fake-gamma'){console.error('provider offline');process.exit(1);}
if(model==='fake-alpha'){writeFileSync('feature.txt','alpha line 1\nalpha line 2\n');}
else{writeFileSync('broken.txt','beta\n');writeFileSync('README.md','# beta edit\nmore\nlines\n');}
console.log(JSON.stringify({text:`${model} answered: ${process.env.COMPARE_PROMPT}`,usage:{estimatedApiUsd:model==='fake-alpha'?0.0123:0.0456,costUnknown:false}}));
