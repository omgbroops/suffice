// Fake Claude Code for UI captures: appends Claude-format JSONL to argv[2] and prints the real permission dialog on its screen.
import fs from 'node:fs';
const file=process.argv[2];let n=0,t0=Date.parse('2026-11-15T10:00:00Z');
const line=o=>fs.appendFileSync(file,JSON.stringify({sessionId:'s1',cwd:'/tmp/example-project',gitBranch:'main',isSidechain:false,uuid:'u'+(++n),timestamp:new Date(t0+=1500).toISOString(),...o})+'\n');
const asst=(content,extra={})=>line({type:'assistant',message:{id:'m'+n,model:'claude-haiku-4-5',content,usage:{input_tokens:3000,output_tokens:80,cache_read_input_tokens:20000,cache_creation_input_tokens:0},...extra}});
const use=(id,name,input)=>asst([{type:'tool_use',id,name,input}]);
const res=(id,content,tur,is_error=false)=>line({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content,is_error}]},toolUseResult:tur});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
console.log('Claude Code v2.1.0\nclaude-haiku-4-5 with high effort\n');
const dialog=()=>console.log(` Bash command

   rm -rf build
   Remove build output

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, allow all rm commands this session
   3. No, and tell Claude what to do differently

 Esc to cancel`);
await sleep(300);
line({type:'user',message:{content:'Clean the build output and fix the greeting.'}});
asst([{type:'thinking',thinking:'Check what is in the build folder first, then fix the greeting and list the work.'}]);
use('t1','Bash',{command:'ls build && echo done',description:'List build'});
res('t1','a.o\nb.o\nmain.o\ndone',{stdout:'a.o\nb.o\nmain.o\ndone\n',stderr:''});
asst([{type:'text',text:'The build folder holds three object files. Now the greeting.'}]);
use('t2','Edit',{file_path:'/tmp/example-project/greet.js',old_string:"console.log('helo')",new_string:"console.log('hello')"});
res('t2','ok',{filePath:'/tmp/example-project/greet.js',structuredPatch:[{oldStart:1,oldLines:3,newStart:1,newLines:3,lines:[" const who='world';","-console.log('helo');","+console.log('hello');"," export default who;"]}]});
use('t3','Bash',{command:'node missing.js'});
res('t3','Exit code 1\nError: Cannot find module missing.js',{stdout:'',stderr:'Error: Cannot find module missing.js'},true);
use('t4','TodoWrite',{todos:[{content:'Remove build output',status:'in_progress'},{content:'Fix greeting',status:'completed'},{content:'Run tests',status:'pending'}]});
// two parallel subagents: a1 finished (with nested child a3), a2 still running; children live in <transcript>/subagents/
const sub=file.replace(/\.jsonl$/,'')+'/subagents';fs.mkdirSync(sub,{recursive:true});
const kid=(id,type,desc,toolUseId,rows,extra={})=>{let k=0,t=Date.parse('2026-11-15T10:00:10Z');
 fs.writeFileSync(`${sub}/agent-${id}.meta.json`,JSON.stringify({agentType:type,description:desc,toolUseId,...extra}));
 for(const r of rows)fs.appendFileSync(`${sub}/agent-${id}.jsonl`,JSON.stringify({sessionId:'s1',isSidechain:true,agentId:id,uuid:id+(++k),timestamp:new Date(t+=1200).toISOString(),...r})+'\n');};
const kasst=c=>({type:'assistant',message:{id:'k'+Math.random(),model:'claude-haiku-4-5',content:c,usage:{input_tokens:900,output_tokens:60}}});
const kres=(id,c,tur)=>({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content:c,is_error:false}]},toolUseResult:tur});
kid('a1','Explore','Find other typos in greet.js','t5a',[
 {type:'user',message:{content:'Find other typos in greet.js'}},
 kasst([{type:'tool_use',id:'c1',name:'Grep',input:{pattern:'helo',path:'/tmp/example-project'}}]),kres('c1','No matches',{}),
 kasst([{type:'tool_use',id:'c2',name:'Read',input:{file_path:'/tmp/example-project/greet.js'}}]),kres('c2','const who',{}),
 kasst([{type:'tool_use',id:'n1',name:'Task',input:{subagent_type:'general-purpose',prompt:'Check the README for the same typo'}}]),
 kres('n1','README is clean.',{agentId:'a3'}),
 kasst([{type:'text',text:'No other typos in greet.js.'}])]);
kid('a3','general-purpose','Check README for typos','n1',[
 {type:'user',message:{content:'Check the README for the same typo'}},
 kasst([{type:'tool_use',id:'d1',name:'Read',input:{file_path:'/tmp/example-project/README.txt'}}]),kres('d1','Hello',{}),
 kasst([{type:'text',text:'README is clean.'}])],{parentAgentId:'a1',spawnDepth:2});
kid('a2','Plan','Plan the cleanup of build output','t5b',[
 {type:'user',message:{content:'Plan the cleanup of build output'}},
 kasst([{type:'tool_use',id:'e1',name:'Bash',input:{command:'ls build',description:'List build'}}]),kres('e1','a.o\nb.o',{stdout:'a.o\nb.o',stderr:''}),
 kasst([{type:'tool_use',id:'e2',name:'Glob',input:{pattern:'**/*.o'}}])]);
asst([{type:'tool_use',id:'t5a',name:'Task',input:{subagent_type:'Explore',description:'Find other typos in greet.js',prompt:'Find other typos in greet.js'}},{type:'tool_use',id:'t5b',name:'Task',input:{subagent_type:'Plan',description:'Plan the cleanup of build output',prompt:'Plan the cleanup of build output'}}]);
res('t5a','No other typos.',{status:'completed',agentId:'a1',agentType:'Explore',totalToolUseCount:3,totalTokens:14200,totalDurationMs:21000});
line({type:'system',subtype:'compact_boundary',compactMetadata:{preTokens:90000,postTokens:12000}});
line({type:'system',subtype:'turn_duration',durationMs:42000});
use('t6','Bash',{command:'rm -rf build',description:'Remove build output'});
console.log('✻ Newspapering… (6s · ↓ 388 tokens · thought for 4s)');dialog();
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.on('data',async d=>{const k=String(d);
 if(k==='1'||k==='\r'){console.log('\x1b[2J\x1b[H(approved)');res('t6','',{stdout:'',stderr:''});asst([{type:'text',text:'Build output removed.'}]);line({type:'system',subtype:'turn_duration',durationMs:61000});console.log('\n> ');}
 else if(k==='3'||k==='\x1b'){console.log('\n(declined)');res('t6','The user doesn\'t want to proceed with this tool use. The tool use was rejected',{},true);console.log('\n> ');}});
setInterval(()=>{},1e6);
