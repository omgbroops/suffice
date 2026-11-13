import {parseOptions} from '../../../packages/cli/src/options.mjs';
// Match the CLI's initialization order before loading the engine.
process.env.PI_CODING_AGENT_DIR=parseOptions([]).home;
const {serve}=await import('./worker.mjs');
serve();
