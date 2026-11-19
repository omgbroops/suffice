import {parse} from 'acorn';
import {joinActivityLabels} from './activity-groups.js';
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
 const active=part.done===false,labels={read:['Reading files','Read files'],file_read:['Reading files','Read files'],write:['Writing files','Wrote files'],file_write:['Writing files','Wrote files'],edit:['Editing files','Edited files'],file_edit:['Editing files','Edited files'],bash:['Running bash','Ran bash'],powershell:['Running PowerShell','Ran PowerShell'],browser_tabs:['Getting browser tabs','Got browser tabs'],web_search:['Searching the web','Searched the web'],fetch_content:['Reading web pages','Read web pages'],get_search_content:['Reading search results','Read search results'],set_session_title:['Naming session','Named session'],search:['Searching files','Searched files'],files:['Listing files','Listed files']};
 const label=name=>(labels[name]||[ `Using ${name.replaceAll('_',' ')}`,`Used ${name.replaceAll('_',' ')}`])[active?0:1];
 if(part.name==='codemode'){
  const names=new Set();
  try{
   const tree=parse(input.code||'',{ecmaVersion:'latest',sourceType:'module',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true});
   const member=node=>node?.type==='MemberExpression'?[...member(node.object),node.computed?node.property.value:node.property.name]:node?.type==='Identifier'?[node.name]:[];
   const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='CallExpression'){const path=member(node.callee);if(path[0]==='tools'&&path.length>1)names.add(path.at(-1));}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);};visit(tree);
  }catch{/* An incomplete script retains a neutral execution label. */}
  const actions=[...new Set([...names].map(label))];
  return actions.length?joinActivityLabels(actions):(active?'Running code':'Executed code');
 }
 if(part.name==='tool_search'&&part.done){let found;try{found=JSON.parse(part.output).length}catch{found=0}return `Found ${found} tool${found===1?'':'s'}`;}
 const verb=label(part.name);
 return verb;
}
