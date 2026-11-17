import test from 'node:test';
import assert from 'node:assert/strict';
import {actionTitle} from '../src/action-display.js';
const action=(code,done)=>actionTitle({name:'codemode',text:JSON.stringify({code}),done});
test('codemode labels reflect real calls and active/completed states',()=>{
 assert.equal(action('await tools.read({path:"a"});await tools.read({path:"b"})',false),'Reading files');
 assert.equal(action('await tools.read({});await tools.bash({})',true),'Read files, ran bash');
 assert.equal(action('await tools.browser_tabs({action:"list"})',false),'Getting browser tabs');
 assert.equal(action('// tools.bash({})\ntext("tools.write({})")',true),'Executed code');
 assert.equal(action('await tools["read"]({})',true),'Read files');
 assert.equal(action('await tools.',false),'Running code');
});

test('activity headings combine repeated actions and sentence case',async()=>{const {joinActivityLabels}=await import('../src/activity-groups.js');assert.equal(joinActivityLabels(['Named session, ran bash','Ran bash','Read files']),'Named session, ran bash, read files');});

test('direct tool headings never include commands, paths or queries',()=>{
 assert.equal(actionTitle({name:'bash',text:JSON.stringify({command:'pwd && find . -maxdepth 3'}),done:true}),'Ran bash');
 assert.equal(actionTitle({name:'bash',text:JSON.stringify({command:'long command'}),done:false}),'Running bash');
 assert.equal(actionTitle({name:'read',text:JSON.stringify({path:'very/long/path'}),done:true}),'Read files');
});
