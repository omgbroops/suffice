#!/usr/bin/env node
import {HELP, VERSION, parseOptions} from '../src/options.mjs';

try {
  const options=parseOptions(process.argv.slice(2));
  if(options.help) console.log(HELP);
  else if(options.version) console.log(`Suffice ${VERSION}`);
  else {
    if(Number(process.versions.node.split('.')[0])<24) throw new Error('Suffice requires Node.js 24 or newer.');
    const {main}=await import('../src/main.mjs');
    await main(options);
  }
} catch(error) {
  console.error(`Suffice: ${error.message}`);
  process.exitCode=1;
}
