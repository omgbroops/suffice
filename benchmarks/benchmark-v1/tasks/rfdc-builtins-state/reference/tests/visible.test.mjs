import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const rfdc = createRequire(resolve(W, 'src/package.json'))('./index.js');
test('ordinary nested values remain independent', () => {
 const input={a:[1,{b:2}],nil:null,missing:undefined}; const output=rfdc()(input);
 assert.deepEqual(output,input); output.a[1].b=7; assert.equal(input.a[1].b,2);
});
test('dates keep their value and ordinary self cycles are preserved', () => {
 const input={date:new Date(1000)}; input.self=input; const output=rfdc({circles:true})(input);
 assert.equal(output.self,output); assert.equal(output.date.getTime(),1000); assert.notEqual(output.date,input.date);
});
