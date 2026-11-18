// Fake Claude for sessions-trust.test.mjs: opens on the folder-trust screen and drops every key until "1" trusts it, like the real CLI; typed prompts after that are logged as PROMPT:<text>.
import fs from 'node:fs';
const file=process.argv[2],log=process.env.SIM_LOG;let trusted=false,buf='',n=0;
const R='\x1b[2J\x1b[H';
const line=o=>fs.appendFileSync(file,JSON.stringify({sessionId:'s1',cwd:'/tmp/example-project',isSidechain:false,uuid:'u'+(++n),timestamp:new Date(Date.parse('2026-11-15T10:00:00Z')+n*1500).toISOString(),...o})+'\n');
console.log('Claude Code v2.1.0\nclaude-haiku-4-5 with high effort\n');
console.log(`${R} Quick safety check: Is this a project you created or one you trust?\n\n /tmp/example-project\n\n Claude Code'll be able to read, edit, and execute files here.\n\n ❯ 1. Yes, I trust this folder\n   2. No, exit\n\n Enter to confirm · Esc to cancel`);
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.on('data',d=>{for(const k of String(d)){
 if(!trusted){if(k==='1'||k==='\r'){trusted=true;console.log(`${R}\n❯ `);}continue;}
 if(k==='\r'||k==='\n'){if(buf){if(log)fs.appendFileSync(log,'PROMPT:'+buf+'\n');line({type:'user',message:{content:buf}});buf='';}continue;}
 if(k>=' ')buf+=k;}});
setInterval(()=>{},1e6);
