#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HELP, VERSION, parseOptions} from '../src/options.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');

// Runs the Rust backend in the foreground and returns its exit code.
async function serve(options) {
  const backend=process.env.SUFFICE_BACKEND_BIN || resolve(repo,'backend/target/release/suffice-backend');
  if(!existsSync(backend)) throw new Error('backend not built: run cargo build --release in backend/');
  const args=['serve','--dir',resolve(options.home,'backend')];
  if(options.port!==undefined) args.push('--port',String(options.port));
  if(options.max!==undefined) args.push('--max',String(options.max));
  const child=spawn(backend,args,{stdio:'inherit'});
  for(const sig of ['SIGINT','SIGTERM']) process.on(sig,()=>child.kill(sig));
  return new Promise((done,fail)=>{
    child.on('error',fail);
    child.on('exit',(code,signal)=>done(code ?? (signal ? 1 : 0)));
  });
}

try {
  const options=parseOptions(process.argv.slice(2));
  if(options.help) console.log(HELP);
  else if(options.version) console.log(`Suffice ${VERSION}`);
  else {
    if(Number(process.versions.node.split('.')[0])<24) throw new Error(`Suffice requires Node.js 24 or newer (this is ${process.versions.node}). Get it from https://nodejs.org or run: mise use -g node@24`);
    if(options.command==='serve') process.exitCode=await serve(options);
    else {
      // Keep native UI helpers and crash data in Suffice's selected state directory.
      process.env.PI_CODING_AGENT_DIR=options.home;
      const {main}=await import('../src/main.mjs');
      await main(options);
    }
  }
} catch(error) {
  console.error(`Suffice: ${error.message}`);
  process.exitCode=1;
}
