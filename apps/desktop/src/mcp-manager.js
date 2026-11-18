import {threadViewState} from './thread-view-state.js';
// Settings > MCPs: servers and built-in toolkits, switched everywhere, per project or per thread.
export const tokenText=n=>n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);
export const currentScope=()=>({project:document.querySelector('.project-picker')?.dataset.path||'',projectName:document.querySelector('.project-picker .project-name')?.textContent||'',thread:threadViewState.id||null});
export async function loadMcpState(api,level){const s=currentScope();if(level==='project'&&!s.project)level='global';if(level==='thread'&&!s.thread)level='global';return api.resourceAction({action:'mcp-state',level,project:s.project,thread:s.thread});}
export function drawMcps({api,data,state,scope,row,button,editor,toggle,perform,redraw,status}){
 const here=currentScope(),level=state.level,scopeId=level==='project'?here.project:here.thread;
 const checkNew=async(before,result)=>{await redraw(result);for(const name of Object.keys(result.mcp).filter(n=>!before.includes(n))){status.textContent='Checking '+name+'…';try{await redraw(await api.resourceAction({action:'mcp-health',name}));}catch(e){status.textContent=e.message;}}};
 row('MCP servers','Connect tools over a local command or streamable HTTP.',[
  button('Add server',()=>editor('Add MCP server',[{id:'name',label:'Name'},{id:'target',label:'Executable or HTTPS URL'},{id:'args',label:'Arguments (JSON array)',value:'[]',required:false}],v=>{const server=/^https?:\/\//.test(v.target)?{url:v.target}:{command:v.target,args:JSON.parse(v.args||'[]')};return perform({action:'mcp-save',text:JSON.stringify({mcpServers:{...data.mcp,[v.name]:server}})});})),
  button('Install from snippet',()=>editor('Install MCP server',[{id:'text',label:'JSON snippet or command',value:'',multiline:true,rows:8},{id:'name',label:'Name (optional)',required:false}],async v=>{const before=Object.keys(data.mcp),result=await api.resourceAction({action:'mcp-install',text:v.text,name:v.name});void checkNew(before,result);})),
  button('Edit configuration',()=>editor('MCP configuration',[{id:'text',label:'Server configuration',value:JSON.stringify({mcpServers:data.mcp},null,2),multiline:true}],v=>perform({action:'mcp-save',text:v.text}))),
  button('Check connections',()=>perform({action:'mcp-check'}))]);
 const seg=document.createElement('div');seg.className='settings-segment';seg.role='group';seg.setAttribute('aria-label','Tool scope');
 const indicator=document.createElement('span');indicator.className='settings-segment-indicator';seg.append(indicator);
 for(const [id,label,ok] of [['global','Everywhere',true],['project',here.projectName||'This project',!!here.project],['thread','This thread',!!here.thread]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=!ok;b.dataset.scope=id;b.setAttribute('aria-pressed',String(id===level));b.onclick=()=>{scope.level=id;void redraw();};seg.append(b);}
 requestAnimationFrame(()=>{const b=seg.querySelector('[aria-pressed=true]');if(b){indicator.style.left=b.offsetLeft+'px';indicator.style.width=b.offsetWidth+'px';}});
 row('Tools apply to',level==='global'?'Default for every project and thread.':level==='project'?'Only chats in this project. Overrides the default.':'Only this thread. Overrides project and default.',[seg]);
 const set=(key,enabled)=>perform({action:'mcp-scope',level,key,enabled,id:scopeId});
 const reset=(item,key)=>level!=='global'&&item.source===level?[button('Reset',()=>set(key,null))]:[];
 const origin=item=>item.source!=='default'&&item.source!==level?' · set '+(item.source==='global'?'everywhere':'by '+item.source):'';
 for(const t of state.toolkits)row(t.name,`${t.detail} · ${t.tools.length} tools${t.tokens?` · ~${tokenText(t.tokens)} tokens`:''}${origin(t)}`,[...reset(t,'toolkit:'+t.id),toggle(t.enabled,enabled=>set('toolkit:'+t.id,enabled),t.name+' toolkit')]);
 for(const s of state.servers){const h=s.health,summary=h?(h.ok?`${h.tools.length} tools · ~${tokenText(h.tokens)} tokens`:'Check failed: '+h.error):'Not checked';
  row(s.name,`${summary} · ${s.detail}${origin(s)}`,[button('Check',async()=>{status.textContent='Checking '+s.name+'…';await perform({action:'mcp-health',name:s.name});}),...(s.remote?[button('Sign in',()=>perform({action:'mcp-login',name:s.name})),button('Sign out',()=>perform({action:'mcp-logout',name:s.name}))]:[]),...reset(s,s.id),toggle(s.enabled,enabled=>level==='global'?perform({action:'mcp-toggle',name:s.name,enabled}):set(s.id,enabled),s.name)]);}
 if(!state.servers.length)row('No servers added','Add a command or URL, or paste a snippet.');
 row('Tool schemas in context',`~${tokenText(state.tokens)} tokens across ${state.activeCount} enabled toolkits and servers. Estimated from schema size; checked servers only.`);
}
