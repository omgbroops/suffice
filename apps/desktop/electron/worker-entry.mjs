import {parseOptions} from '../../../packages/cli/src/options.mjs';
import {createDesktopWorker} from './worker-dispatch.mjs';

// Pi reads this setting during module initialization.
const home=parseOptions([]).home;
process.env.PI_CODING_AGENT_DIR=home;
const port=process.parentPort;
const send=value=>port?port.postMessage(value):process.send?.(value);
const receive=await createDesktopWorker({home,send,backend:process.env.SUFFICE_SESSION_BACKEND});
if(port)port.on('message',event=>void receive(event.data));
else if(process.send)process.on('message',message=>void receive(message));
