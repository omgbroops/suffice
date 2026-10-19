import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {default:timeout}=await import(pathToFileURL(process.cwd()+'/index.js'));
const customTimers={
 setTimeout(...args){assert.equal(this,undefined,'timer must not receive customTimers as receiver');return setTimeout(...args);},
 clearTimeout(...args){assert.equal(this,undefined,'clear must not receive customTimers as receiver');return clearTimeout(...args);}
};
assert.equal(await timeout(Promise.resolve('resolved'),{milliseconds:500,customTimers}),'resolved');
assert.equal(await timeout(new Promise(()=>{}),{milliseconds:10,customTimers,fallback:()=> 'fallback'}),'fallback');
console.log('public contract: timer callbacks retain detached invocation compatibility');
