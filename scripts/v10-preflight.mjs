import {inspectPi} from '../src/v10/pi.mjs';
const report=await inspectPi();
console.log(JSON.stringify({...report,note:'Catalog/auth inspection only; no inference. Use npm run login for Pi sign-in.'},null,2));
if(!report.ready)process.exitCode=1;
