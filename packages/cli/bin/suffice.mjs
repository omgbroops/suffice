#!/usr/bin/env node
import {HELP, VERSION, parseOptions} from '../src/options.mjs';

try {
  const options=parseOptions(process.argv.slice(2));
  if(options.help) console.log(HELP);
  else if(options.version) console.log(`Suffice ${VERSION}`);
  else {
    if(Number(process.versions.node.split('.')[0])<24) throw new Error(`Suffice requires Node.js 24 or newer (this is ${process.versions.node}). Get it from https://nodejs.org or run: mise use -g node@24`);
    // Keep native UI helpers and crash data in Suffice's selected state directory.
    process.env.PI_CODING_AGENT_DIR=options.home;
    const {main}=await import('../src/main.mjs');
    await main(options);
  }
} catch(error) {
  console.error(`Suffice: ${error.message}`);
  process.exitCode=1;
}
