import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMessagePresentation} from '../electron/message-presentation.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const user=(id,parentId,text)=>({type:'message',id,parentId,message:{role:'user',timestamp:1000,content:[{type:'text',text}]}});
const assistant=(id,parentId)=>({type:'message',id,parentId,message:{role:'assistant',provider:'opencode-go',model:'fixture',content:[{type:'text',text:id}]}});
const custom=(id,parentId,customType,data)=>({type:'custom',id,parentId,customType,data});
test('turn timing and presentation metadata survive multi-call replies, queued steering and branches',()=>{
 const start=custom('start',null,'suffice:turn-start',{id:'turn',startedAt:1000,model:'fixture',provider:'opencode-go',effort:'high',promptHash:hash('internal prompt'),displayPrompt:'Visible prompt',attachments:[{name:'one.txt',size:3}]}),u=user('user','start','internal prompt'),a=assistant('a','user');
 const steer1=custom('s1','a','suffice:user-presentation',{promptHash:hash('first steer'),displayPrompt:'First'}),steer2=custom('s2','s1','suffice:user-presentation',{promptHash:hash('second steer'),displayPrompt:'Second'}),u1=user('u1','s2','first steer'),u2=user('u2','u1','second steer'),b=assistant('b','u2'),end=custom('end','b','suffice:turn-end',{id:'turn',endedAt:65000});
 const sibling=custom('other','a','suffice:turn-start',{id:'sibling',startedAt:3000}),other=user('other-user','other','Different branch');
 const entries=[start,u,a,steer1,steer2,u1,u2,b,end,sibling,other],present=createMessagePresentation(entries),render=entry=>present(entry,[entry.message])[0];
 assert.equal(render(u).displayText,'Visible prompt');assert.deepEqual(render(u).attachments,[{name:'one.txt',size:3}]);assert.equal(render(u1).displayText,'First');assert.equal(render(u2).displayText,'Second');assert.equal(render(a).turn,render(b).turn);assert.equal(render(b).turn.endedAt,65000);assert.equal(render(b).turn.effort,'high');assert.notEqual(render(other).turn.id,render(b).turn.id);
 assert.equal(u.message.content[0].text,'internal prompt');assert.equal(u.message.attachments,undefined);
});
test('legacy attachments reuse persisted image parts and legacy turns do not invent duration',()=>{
 const level={type:'thinking_level_change',id:'level',parentId:null,thinkingLevel:'medium'},u=user('u','level','Look at these\n\nAttached local files (user-provided data):\n'+JSON.stringify({name:'photo.png',path:'C:/no-read/photo.png',size:10}));u.message.content.push({type:'image',data:'aW1hZ2U=',mimeType:'image/png'});const a=assistant('a','u'),entries=[level,u,a],present=createMessagePresentation(entries),saved=present(u,[u.message])[0],reply=present(a,[a.message])[0];
 assert.equal(saved.displayText,'Look at these');assert.equal(saved.attachments[0].imageIndex,0);assert.equal(saved.content[1].data,'aW1hZ2U=');assert.equal(reply.turn.effort,'medium');assert.equal(reply.turn.endedAt,undefined);
});
