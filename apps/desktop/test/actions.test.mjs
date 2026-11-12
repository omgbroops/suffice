import test from 'node:test';
import assert from 'node:assert/strict';
import {groupActions} from '../src/action-display.js';
test('parallel tool calls keep their own multi-part results in one action each',()=>{
 const calls={role:'assistant',content:[{type:'toolCall',id:'a',name:'codemode',text:'{}'},{type:'toolCall',id:'b',name:'codemode',text:'{}'}]};
 const grouped=groupActions([calls,{role:'toolResult',toolCallId:'b',toolName:'codemode',content:[{text:'Completed'},{text:'{"output":"second output"}'}]},{role:'toolResult',toolCallId:'a',toolName:'codemode',isError:true,content:[{text:'first error'}]}]);
 assert.equal(grouped.length,1);assert.equal(grouped[0].content.length,2);assert.equal(grouped[0].content[1].output,'Completed\n\nsecond output');assert.equal(grouped[0].content[0].output,'first error');assert.equal(grouped[0].content[0].isError,true);assert.equal(calls.content[0].type,'toolCall');
});
