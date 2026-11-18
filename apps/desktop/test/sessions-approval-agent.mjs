// Fake Claude for sessions-approval.test.mjs: prints permission, plan, question and trust screens, logs every key it receives to SIM_LOG.
import fs from 'node:fs';
const file=process.argv[2],log=process.env.SIM_LOG;let n=0,t0=Date.parse('2026-11-15T10:00:00Z');
const line=o=>fs.appendFileSync(file,JSON.stringify({sessionId:'s1',cwd:'/tmp/example-project',gitBranch:'main',isSidechain:false,uuid:'u'+(++n),timestamp:new Date(t0+=1500).toISOString(),...o})+'\n');
const use=(id,name,input)=>line({type:'assistant',message:{id:'m'+n,model:'claude-haiku-4-5',content:[{type:'tool_use',id,name,input}],usage:{input_tokens:3000,output_tokens:80}}});
const R='\x1b[2J\x1b[H',rule='╌'.repeat(100),solid='─'.repeat(100);
const LONG=Array.from({length:14},(_,i)=>`echo "step ${i+1}" && node scripts/build-part-${i+1}.js --verbose --out dist/part-${i+1}`).join(' && \\\n  ');
const bash=cmd=>`${R} Bash command\n\n ${solid}\n ${cmd}\n ${solid}\n Run the build steps\n\n Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and don’t ask again for: node *\n   3. Yes, and switch to auto mode · auto mode handles these prompts for you\n   4. No\n\n Esc to cancel · Tab to amend`;
const SC={
 bash:()=>{use('t1','Bash',{command:'rm -rf build',description:'Remove build output'});return `${R} Bash command\n\n   rm -rf build\n   Remove build output\n\n Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, allow all rm commands this session\n   3. No, and tell Claude what to do differently\n\n Esc to cancel`;},
 long:()=>{use('t2','Bash',{command:LONG,description:'Run the build steps'});return bash(LONG);},
 edit:()=>{use('t3','Edit',{file_path:'/tmp/example-project/src/greet.js',old_string:'Helo',new_string:'Hello'});return `${R} Edit file\n src/greet.js\n ${rule}\n 3 -  return 'Helo, ' + name;\n 3 +  return 'Hello, ' + name;\n ${rule}\n Do you want to make this edit to greet.js?\n ❯ 1. Yes\n   2. Yes, and switch to accept edits for this session (shift+tab)\n   3. No\n\n Esc to cancel · Tab to amend`;},
 plan:()=>`${R}   Ready to code?\n\n   Here is Claude's plan:\n  ${rule}\n   Context\n\n   Add one comment line at the top of util.js.\n\n   Change\n\n   - Insert one line at line 1.\n   - Keep a shebang first if present.\n  ${rule}\n\n ${solid}\n   Claude has written up a plan and is ready to execute. Would you like to proceed?\n\n   ❯ 1. Yes, and use auto mode\n     2. Yes, manually approve edits\n     3. Tell Claude what to change\n\n   ctrl+g to edit in Vim`,
 ask:()=>`${R}Which color do you prefer, red or blue?\n\n❯ 1. Red\n     Choose red as your color.\n  2. Blue\n     Choose blue as your color.\n  3. Type something.\n\nEnter to select · ↑/↓ to navigate · Esc to cancel`,
 multi:()=>`${R}${solid}\n←  ☐ Fruits  ✔ Submit  →\nPick fruits\n❯ 1. [ ] apple\n         Apple\n  2. [ ] pear\n         Pear\n  3. [ ] plum\n         Plum\n  4. [ ] Type something\n     Submit\n${solid}\n  5. Chat about this\nEnter to select · ↑/↓ to navigate · Esc to cancel`,
 trust:()=>`${R} Quick safety check: Is this a project you created or one you trust?\n\n /tmp/example-project\n\n Claude Code'll be able to read, edit, and execute files here.\n\n ❯ 1. Yes, I trust this folder\n   2. No, exit\n\n Enter to confirm · Esc to cancel`,
};
console.log('Claude Code v2.1.0\nclaude-haiku-4-5 with high effort\n');
line({type:'user',message:{content:'Run the build.'}});
if(process.stdin.isTTY)process.stdin.setRawMode(true);
let buf='';
process.stdin.on('data',d=>{for(const k of String(d)){
 if(log)fs.appendFileSync(log,JSON.stringify(k)+'\n');
 if((k==='\r'||k==='\n')&&buf){const c=buf.replace(/^\//,'').trim();buf='';console.log(SC[c]?SC[c]():`${R}(answered ${JSON.stringify(c)})\n${solid}\n❯ \n${solid}\n\n  ⏸ manual mode on`);continue;}
 if(k>=' '&&k!=='\x7f'&&!/^[1-4]$/.test(k)){buf+=k;continue;}
 if(/^[1-4]$/.test(k))console.log(`${R}(answered ${k})\n${solid}\n❯ \n${solid}\n\n  ⏸ manual mode on`);}});
setInterval(()=>{},1e6);
