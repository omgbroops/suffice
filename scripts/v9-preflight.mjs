// Read model metadata only: this command never starts an inference turn.
import {resolveCodex} from '../src/v9/codex.mjs';
import {MODELS} from '../src/v9/config.mjs';
import {runProcess} from '../src/v9/process.mjs';
const cli=await resolveCodex();
const version=await runProcess(cli.command,[...cli.prefix,'--version'],{timeoutMs:10000});
const catalog=await runProcess(cli.command,[...cli.prefix,'debug','models'],{timeoutMs:30000});
if(version.exitCode!==0||catalog.exitCode!==0)throw Error('Cannot inspect native Codex CLI metadata');
const parsed=JSON.parse(catalog.stdout),available=parsed.models?.map(m=>m.slug);
if(!Array.isArray(available))throw Error('Unrecognized native model catalog');
const missing=Object.values(MODELS).filter(m=>!available.includes(m));
console.log(JSON.stringify({cliVersion:version.stdout.trim(),requested:MODELS,available,missing,ready:missing.length===0,
  note:'Catalog presence is a preflight check, not a guarantee of account access or successful execution.'},null,2));
if(missing.length)process.exitCode=1;
