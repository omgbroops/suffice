import assert from 'node:assert/strict';
import PQueue from '../source/index.ts';
async function order(entries) {
 const queue=new PQueue({concurrency:1,autoStart:false});
 const actual=[];
 const pending=entries.map(([value,options])=>queue.add(()=>{actual.push(value);return value;},options));
 queue.start();await Promise.all(pending);await queue.onIdle();
 assert.equal(queue.size,0);assert.equal(queue.pending,0);
 return actual;
}
const cases=[
 ['undefined FIFO', [['first',{priority:undefined}],['second',{priority:undefined}],['third',{priority:undefined}]], ['first','second','third']],
 ['mixed priorities', [['zero-a',{priority:undefined}],['negative',{priority:-2}],['high',{priority:3}],['zero-b',{}],['zero-c',{priority:0}]], ['high','zero-a','zero-b','zero-c','negative']],
 ['omitted compatibility', [['a'],['b'],['c']], ['a','b','c']],
 ['explicit zero FIFO', [['a',{priority:0}],['b',{priority:0}],['c',{priority:0}]], ['a','b','c']],
];
let failures=0;
for(const [name,entries,expected] of cases){try{assert.deepEqual(await order(entries),expected);console.log('PASS',name);}catch(error){failures++;console.error('FAIL',name,error.message);}}
const queue=new PQueue({autoStart:false});const promises=[];for(const priority of [undefined,undefined,0])promises.push(queue.add(()=>1,{priority}));
try{assert.equal(queue.sizeBy({priority:0}),3);console.log('PASS priority filtering defaults');}catch(error){failures++;console.error('FAIL priority filtering defaults',error.message);}
queue.start();await Promise.all(promises);assert.equal(failures,0,`${failures} priority contract cases failed`);
