import pWaitFor from './index.js';
import {setTimeout as delay} from 'node:timers/promises';

const controller = new AbortController();
let finishCondition;

const waiting = pWaitFor(() => new Promise(resolve => {
    finishCondition = resolve;
}), {signal: controller.signal});

controller.abort(new Error('cancelled'));

console.log(await Promise.race([
    waiting.then(() => 'fulfilled', error => error.message),
    delay(30).then(() => 'still pending'),
]));
// Actual: 'still pending'. Expected: 'cancelled'.

finishCondition(true);
console.log(await waiting.then(() => 'fulfilled despite abort', error => error.message));
// Actual: 'fulfilled despite abort'. Expected: rejection with the abort reason.
