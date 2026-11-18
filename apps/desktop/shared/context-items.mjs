// What goes into the model's context on a turn, with token estimates. Shared by the worker (builds the
// inventory, applies the user's choices) and tests; the renderer only receives the plain items.
// shortcut: tokens are chars/4, not the provider tokenizer; swap in a real tokenizer when exact counts matter.
export const tokens=value=>Math.ceil(String(value??'').length/4);
export const LONG_RESULT=1000;
export const REMOVED='[Removed from context by the user]';
const FILE_TOOLS=new Set(['read','write','edit']);
const text=content=>typeof content==='string'?content:(content||[]).map(part=>part.type==='text'?part.text:part.type==='toolCall'?part.name+JSON.stringify(part.arguments??{}):part.type==='image'?'[image]':'').join('');
export const messageId=(message,index)=>`m${index}:${message.timestamp??0}`;

// Deterministic digest of a long tool result: first lines plus a size note.
export function summarize(value){
 const lines=String(value).split('\n');
 return `${lines.slice(0,3).join('\n').slice(0,300)}\n[Summary: ${lines.length} lines, ${String(value).length} characters; full result left out]`;
}

export function contextItems({system,skills=[],tools=[],messages=[]}={}){
 const items=[];
 const skillTokens=skills.reduce((sum,skill)=>sum+tokens(skill.name+skill.description),0);
 // Skill descriptions are listed inside the system prompt: count them once, under Skills.
 if(system!=null)items.push({id:'system',kind:'system',label:'System prompt',tokens:Math.max(0,tokens(system)-skillTokens),fixed:true});
 for(const skill of skills)items.push({id:'skill:'+skill.name,kind:'skills',label:skill.name,tokens:tokens(skill.name+skill.description),fixed:true});
 for(const tool of tools)items.push({id:'tool:'+tool.name,kind:'tools',label:tool.name,tokens:tokens(tool.name+tool.description+JSON.stringify(tool.parameters??{}))});
 const paths=new Map();
 messages.forEach((message,index)=>{
  const id=messageId(message,index),body=text(message.content);
  if(message.role==='assistant')for(const part of message.content||[])if(part.type==='toolCall')paths.set(part.id,part.arguments?.path);
  if(message.role==='toolResult'){
   const file=FILE_TOOLS.has(message.toolName)&&paths.get(message.toolCallId),n=tokens(body),long=n>LONG_RESULT&&!message.isError;
   items.push({id,kind:file?'files':'history',label:file||`${message.toolName||'tool'} result`,tokens:n,...(long?{summaryTokens:tokens(summarize(body))}:{})});
  }else if(message.role==='user'||message.role==='assistant'){
   const calls=message.role==='assistant'&&(message.content||[]).some(part=>part.type==='toolCall');
   items.push({id,kind:'history',label:`${message.role==='user'?'You':'Assistant'}: ${body.replace(/\s+/g,' ').trim().slice(0,70)||'(no text)'}`,tokens:tokens(body),...(calls?{fixed:true}:{})});
  }
 });
 return items;
}

// A removed message keeps its place with placeholder text, so tool calls and results stay paired.
export function applyContext(messages,{exclude=[],summaries=false}={}){
 const removed=new Set(exclude);
 return messages.map((message,index)=>{
  const hasCalls=message.role==='assistant'&&(message.content||[]).some(part=>part.type==='toolCall');
  if(removed.has(messageId(message,index))&&!hasCalls&&['user','assistant','toolResult'].includes(message.role))return {...message,content:[{type:'text',text:REMOVED}]};
  if(summaries&&message.role==='toolResult'&&!message.isError){const body=text(message.content);if(tokens(body)>LONG_RESULT)return {...message,content:[{type:'text',text:summarize(body)}]};}
  return message;
 });
}

// Hooks the choices into the next run only; the returned function puts the session back.
export function installContext(session,choices){
 const exclude=(choices?.exclude||[]).filter(id=>typeof id==='string'),summaries=!!choices?.summaries;
 if(!exclude.length&&!summaries||!session?.agent)return ()=>{};
 const agent=session.agent,previous=agent.transformContext,active=session.getActiveToolNames?.(),drop=exclude.filter(id=>id.startsWith('tool:')).map(id=>id.slice(5));
 agent.transformContext=async(messages,signal)=>applyContext(previous?await previous.call(agent,messages,signal):messages,{exclude,summaries});
 if(drop.length&&active)session.setActiveToolsByName(active.filter(name=>!drop.includes(name)));
 return ()=>{agent.transformContext=previous;if(drop.length&&active)session.setActiveToolsByName(active);};
}

export function sessionInventory(session,messages){
 const active=new Set(session?.getActiveToolNames?.()||[]);
 return {
  window:session?.model?.contextWindow??null,
  items:contextItems({system:session?.systemPrompt,skills:session?.resourceLoader?.getSkills?.().skills,tools:(session?.getAllTools?.()||[]).filter(tool=>active.has(tool.name)),messages}),
 };
}
