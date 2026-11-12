export function groupActions(messages){
 const calls=[],output=[];
 const resultText=parts=>parts.map(part=>{const text=part.text||'';try{const data=JSON.parse(text);return typeof data.output==='string'?data.output:JSON.stringify(data,null,2);}catch{return text;}}).filter(Boolean).join('\n\n');
 for(const entry of messages){
  if(entry.role==='toolResult'){
   const call=calls.find(call=>entry.toolCallId&&call.id===entry.toolCallId)||calls.find(call=>!call.done&&call.name===entry.toolName);
   if(call){call.output=resultText(entry.content);call.done=true;call.isError=entry.isError;}else output.push({...entry,content:[{type:'action',name:entry.toolName||'tool',output:resultText(entry.content),done:true,isError:entry.isError}]});continue;
  }
  output.push({...entry,content:entry.content.map(part=>{if(part.type!=='toolCall')return part;const action={...part,type:'action',done:false,output:''};calls.push(action);return action;})});
 }
 return output;
}
export function actionTitle(part){
 let input={};try{input=JSON.parse(part.text||'{}');}catch{}
 const verb={codemode:'Executed code',file_read:'Read file',read:'Read file',search:'Searched',file_edit:'Edited file',file_write:'Wrote file',test:'Ran tests',files:'Listed files'}[part.name]||`Used ${part.name}`;
 const target=input.path||input.filePath||input.command||input.query;
 return target?`${verb} · ${String(target).split('\n')[0].slice(0,100)}`:verb;
}
