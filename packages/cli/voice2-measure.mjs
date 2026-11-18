// Measures agent replies under the real Suffice prompt assembly via Claude Code CLI (haiku, tools on).
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PROMPT,SUFFICE_IDENTITY} from './src/session.mjs';
import {VOICE_RULES,slopHits} from './src/voice.mjs';
const PROMPTS=['hi','what are you','what can you do here','let vs const in js','fix the typo in notes.txt','why is my push rejected'];
const variants={old:SUFFICE_IDENTITY+'\n\n'+PROMPT,new:SUFFICE_IDENTITY+'\n\n'+VOICE_RULES+'\n\n'+PROMPT};
const only=process.argv[2];const out={};
const ENV=/\b(?:working directory|cwd|process tree|(?:isn't|is not|not) a (?:git )?(?:repo|repository)|no git|folder (?:is|contains)|bytes|environment|config|directory (?:is|contains)|I (?:see|can see|found)|pwd|ls\b)/gi;
const CLOSER=/\b(?:paste (?:it|the)|send me|share the (?:error|output|log)|want me to|let me know|feel free|would you like|should I|do you want|if you(?:'d| would) like)\b/gi;
for(const [name,sys] of Object.entries(variants)){
 if(only&&only!==name)continue;
 out[name]=PROMPTS.map(p=>{
  const d=mkdtempSync(join(tmpdir(),'v2-'));
  for(const f of ['report.pdf','invoice.pdf','scan.png','photo.jpg'])writeFileSync(join(d,f),'x');
  writeFileSync(join(d,'notes.txt'),'Meeting notes\nWe shoud ship on friday.\n');
  let r='';
  try{r=execFileSync('claude',['-p',p,'--model','haiku','--system-prompt',sys,'--setting-sources','','--dangerously-skip-permissions','--disable-slash-commands'],{cwd:d,encoding:'utf8',timeout:120000,killSignal:'SIGKILL',stdio:['ignore','pipe','pipe']});}catch(e){r='ERROR '+e.message.slice(0,100);}
  const m=(r.match(/\S+/g)||[]).length;
  if(r.startsWith('ERROR'))process.exitCode=1;// an error is never an answer
  return {p,words:m,slop:slopHits(r),env:(r.match(ENV)||[]).length,closer:(r.match(CLOSER)||[]).length,reply:r.trim()};
 });
}
console.log(JSON.stringify(out,null,1));
