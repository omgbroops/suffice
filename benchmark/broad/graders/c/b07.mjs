import assert from 'node:assert/strict';
import process from 'node:process';
import {$} from '../index.js';
const script = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';
const run = $( {reject: true} );
const cases = [
 ['standard', 'alpha bravo', ['alpha', 'bravo']],
 ['continuation spaces', 'alpha\\\n  bravo', ['alpha', 'bravo']],
 ['continuation literal tab', 'delta\\\n\techo', ['delta', 'echo']],
 ['continuation joined', 'fo\\\no', ['foo']],
 ['two continuations', 'one\\\n  two\\\n  three', ['one','two','three']],
 ['continuation before interpolation', 'alpha\\\n  ${value}', ['alpha', 'two words']],
];
const errors=[];
for (const [name, body, expected] of cases) {
 try {
  const invoke = new Function('run','node','script','value', 'return run`${node} -e ${script} -- '+body+'`;');
  const result=await invoke(run,process.execPath,script,'two words');
  assert.deepEqual(JSON.parse(result.stdout), expected);
  console.log('PASS',name);
 } catch(error) {errors.push(name+': '+error.message); console.error('FAIL',name,error.message);}
}
assert.equal(errors.length,0, errors.join('\n'));
