// Turns pasted JSON or a launch command into an {mcpServers} object.
export function splitCommand(text){
 const out=[];let cur='',quote=null,started=false;
 for(const ch of text.trim()){
  if(quote){if(ch===quote)quote=null;else cur+=ch;}
  else if(ch==='"'||ch==="'"){quote=ch;started=true;}
  else if(/\s/.test(ch)){if(cur||started)out.push(cur);cur='';started=false;}
  else cur+=ch;
 }
 if(quote)throw new Error('Unclosed quote in command');
 if(cur||started)out.push(cur);return out;
}
const slug=text=>text.replace(/^@[^/]+\//,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
export function nameFor(server){
 if(server.url){try{return slug(new URL(server.url).hostname.replace(/^(www|mcp)\./,'').split('.')[0])||'server';}catch{return 'server';}}
 const runner=/^(npx|bunx|uvx|pnpx|dlx|node|python3?|deno)$/.test(server.command.split(/[\\/]/).pop());
 const arg=runner?(server.args||[]).find(a=>!a.startsWith('-')):null;
 return slug(arg||server.command.split(/[\\/]/).pop())||'server';
}
export function parseSnippet(text,name){
 if(typeof text!=='string'||!text.trim()||text.length>100000)throw new Error('Paste a JSON snippet or a command');
 const raw=text.trim();let servers;
 if(raw.startsWith('{')){
  let data;try{data=JSON.parse(raw);}catch{throw new Error('That is not valid JSON');}
  if(data.mcpServers&&typeof data.mcpServers==='object')servers=data.mcpServers;
  else if(data.command||data.url)servers={[name||nameFor(data)]:data};
  else servers=data;
 }else if(/^https?:\/\/\S+$/.test(raw))servers={[name||nameFor({url:raw})]:{url:raw}};
 else{const [command,...args]=splitCommand(raw);if(!command)throw new Error('Paste a JSON snippet or a command');const server={command,args};servers={[name||nameFor(server)]:server};}
 if(!servers||typeof servers!=='object'||Array.isArray(servers)||!Object.keys(servers).length)throw new Error('No servers found in that snippet');
 return {mcpServers:servers};
}
