import test from 'node:test';
import assert from 'node:assert/strict';
import {suggest,taskLooks} from '../src/usage-optimizer.js';

const sol={id:'sol',provider:'p',name:'Sol',efforts:['low','medium','high']};
const mini={id:'sol-mini',provider:'p',name:'Sol Mini',available:true,efforts:['low']};
const base={model:sol,effort:'high',models:[sol,mini]};

test('simple asks at high effort suggest low effort',()=>{
 const s=suggest({...base,text:'Explain what this function does'});
 assert.equal(s.kind,'effort');assert.equal(s.effort,'low');
});
test('complex, long, multi-line, code-fence or tiny asks get no hint',()=>{
 for(const text of ['Refactor the auth module across all files','x'.repeat(300),'fix typo\n1\n2\n3\n4','explain ```js\nx\n```','hi','Implement a new settings page'])assert.equal(suggest({...base,text}),null,text);
});
test('trivial ask already at low effort suggests a lighter model; non-trivial does not',()=>{
 const s=suggest({...base,effort:'low',text:'Fix a typo in the README'});assert.equal(s.kind,'model');assert.equal(s.model,'sol-mini');
 assert.equal(suggest({...base,effort:'low',text:'Summarize the readme for me please'}),null);
 assert.equal(suggest({model:mini,effort:'low',models:[sol,mini],text:'Fix a typo in the README'}),null);
});
test('no hint for CLI agents, models without effort levels, or when nothing cheaper exists',()=>{
 assert.equal(suggest({...base,model:{...sol,provider:'cli',efforts:[]},text:'Fix a typo in the README'}),null);
 assert.equal(suggest({...base,model:{...sol,efforts:[]},text:'Fix a typo in the README'}),null);
 assert.equal(suggest({model:sol,effort:'low',models:[sol],text:'Fix a typo in the README'}),null);
 assert.equal(suggest({...base,model:null,text:'Fix a typo'}),null);
});
test('taskLooks classes',()=>{assert.equal(taskLooks('rename foo to bar'),'trivial');assert.equal(taskLooks('why is the sky blue and green'),'simple');assert.equal(taskLooks('add oauth login'),'unknown');});
