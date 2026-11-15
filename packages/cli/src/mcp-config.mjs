import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function mcpConfig(home,cwd,trusted){
 const entries=new Map(),errors=[];const files=[resolve(home,'mcp.json'),...(trusted?[resolve(cwd,'.pi','mcp.json')]:[])];
 for(const file of files){let data;try{data=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')errors.push('Could not read '+file);continue;}
 for(const [name,config] of Object.entries(data.mcpServers||{})){if(!/^[a-zA-Z0-9_-]+$/.test(name)||!config||typeof config!=='object'){errors.push('Invalid MCP server name or configuration');continue;}const previous=entries.get(name);entries.set(name,{name,config:previous&&!config.command&&!config.url?{...previous.config,...config}:config,source:file,scope:file===files[0]?'user':'project'});}}
 return {servers:[...entries.values()],errors,autoEnableCodemode:true};
}
