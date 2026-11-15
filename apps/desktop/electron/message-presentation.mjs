import {createHash} from 'node:crypto';
const textOf=message=>typeof message.content==='string'?message.content:(message.content||[]).filter(part=>part.type==='text').map(part=>part.text||'').join('\n\n');
export function createMessagePresentation(journal){
 const byId=new Map(journal.filter(entry=>entry.id).map(entry=>[entry.id,entry])),ends=new Map(),turns=new Map(),cache=new Map();let legacy=null,sequence=0;
 for(const entry of journal)if(entry.type==='custom'&&entry.customType==='suffice:turn-end'&&entry.data?.id)ends.set(entry.data.id,entry.data);
 function turnFor(entry){
  if(!entry.id)return null;const path=[];let node=entry,value=null;const visited=new Set();
  while(node&&!visited.has(node.id)){visited.add(node.id);if(cache.has(node.id)){value=cache.get(node.id);break;}path.push(node.id);if(node.type==='custom'&&node.customType==='suffice:turn-start'){const data=node.data||{};if(!turns.has(data.id))turns.set(data.id,{id:data.id,startedAt:data.startedAt,endedAt:ends.get(data.id)?.endedAt,provider:data.provider,model:data.model,modelName:data.modelName,effort:data.effort});value=turns.get(data.id);break;}if(node.type==='custom'&&node.customType==='suffice:turn-end')break;node=byId.get(node.parentId);}
  for(const id of path)cache.set(id,value);return value;
 }
 function userDisplay(entry,message){const hash=createHash('sha256').update(textOf(message)).digest('hex');let node=byId.get(entry.parentId),crossedUser=false;const seen=new Set();while(node&&!seen.has(node.id)){seen.add(node.id);if(node.type==='message'&&node.message?.role==='user')crossedUser=true;if(node.type==='custom'&&['suffice:turn-start','suffice:user-presentation'].includes(node.customType)&&((node.data?.promptHash&&node.data.promptHash===hash)||(!node.data?.promptHash&&!crossedUser)))return node.data;node=byId.get(node.parentId);}return null;}
 return (entry,messages)=>messages.map(message=>{
  let turn=turnFor(entry);if(message.role==='user'&&!turn)legacy={id:entry.id||'legacy-'+(++sequence)};turn??=legacy;
  if(message.role==='assistant'&&turn){turn.provider??=message.provider;turn.model??=message.model;if(!turn.effort){let node=entry;const seen=new Set();while(node&&!seen.has(node.id)){seen.add(node.id);if(node.type==='thinking_level_change'){turn.effort=node.thinkingLevel;break;}node=byId.get(node.parentId);}}}
  if(message.role!=='user')return {...message,turn};
  const display=userDisplay(entry,message),result={...message,turn,...(display?{displayText:display.displayPrompt,attachments:display.attachments||[]}: {})};
  if(!display){const text=textOf(message),marker='\n\nAttached local files (user-provided data):\n',at=text.lastIndexOf(marker);if(at>=0){try{const files=text.slice(at+marker.length).trim().split('\n').map(JSON.parse);if(files.length<=20&&files.every(file=>typeof file.name==='string'&&typeof file.path==='string'&&Number.isFinite(file.size))){let imageIndex=0;result.displayText=text.slice(0,at);result.attachments=files.map(file=>{const extension=file.name.split('.').pop().toLowerCase(),type=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'})[extension];return {name:file.name,size:file.size,type:type||'application/octet-stream',...(type?{imageIndex:imageIndex++}:{})};});}}catch{}}}
  return result;
 });
}
