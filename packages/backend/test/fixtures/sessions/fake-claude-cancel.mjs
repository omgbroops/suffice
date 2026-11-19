// Fake Claude Code for the watchdog cancel test: one claim waiting on a running command, no permission prompt, Esc interrupts.
import fs from 'node:fs';
const file=process.argv[2];let n=0,t0=Date.parse('2026-11-15T10:00:00Z');
const line=o=>fs.appendFileSync(file,JSON.stringify({sessionId:'s1',cwd:'/tmp/example-project',gitBranch:'main',isSidechain:false,uuid:'u'+(++n),timestamp:new Date(t0+=1500).toISOString(),...o})+'\n');
const asst=content=>line({type:'assistant',message:{id:'m'+n,model:'claude-haiku-4-5',content,usage:{input_tokens:3000,output_tokens:80}}});
const use=(id,name,input)=>asst([{type:'tool_use',id,name,input}]);
const res=(id,content,tur,is_error=false)=>line({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content,is_error}]},toolUseResult:tur});
const say=text=>asst([{type:'text',text}]);
console.log('Claude Code v2.1.0\nclaude-haiku-4-5 with high effort\n');
await new Promise(r=>setTimeout(r,300));
line({type:'user',message:{content:'Run the tests.'}});
use('t1','Bash',{command:'npm test'});
say('Tests pass.');
// no permission prompt: the command just runs, so the session reports "working" until Esc interrupts it
console.log('✻ Newspapering… (6s · ↓ 388 tokens · thought for 4s)');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.on('data',d=>{if(!/\x1b|\x03/.test(String(d)))return;console.log('\x1b[2J\x1b[H');res('t1','[Request interrupted by user for tool use]',{stdout:'',stderr:''},true);line({type:'user',message:{content:[{type:'text',text:'[Request interrupted by user for tool use]'}]}});console.log('Interrupted · What should Claude do instead?');});
setInterval(()=>{},1e6);
