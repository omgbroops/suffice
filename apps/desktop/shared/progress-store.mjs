// Progress: an append-only log of {tool,tokens,outcome,ts} events and a pure reducer over it.
// XP comes only from tokens consumed, finished sessions and passing test runs; idle time adds nothing.
// Idea source: calv.info/coding-agent-metagame (stats from tool use); no code copied.
export const TOKENS_PER_XP=500,XP_FINISH=20,XP_PASS=10;
export const STAGE_LEVELS=[1,4,8,13,20];
export const TOOL_STAT={bash:'debugging',edit:'patience',write:'wisdom',test:'rigor'};
// A test run is a runner command at the start of a shell segment; "ls test" or "grep test" is not one.
const RUNNER=/^(?:(?:npx|env|time|sudo)\s+|[A-Z_][A-Z0-9_]*=\S*\s+)*(?:pytest|jest|vitest|mocha|rspec|phpunit|(?:npm|yarn|pnpm|bun|cargo|go|make|deno|mix|dotnet|gradle|mvn|swift|rake)\s+(?:run\s+)?test\b|npm\s+t\b|node\s+(?:\S+\s+)*--test\b|python3?\s+-m\s+(?:pytest|unittest)\b|\.\/gradlew\s+test\b)/i;
export const isTestCommand=input=>String(input?.command||input?.cmd||'').split(/&&|\|\||[;|\n]/).some(seg=>RUNNER.test(seg.trim()));
// Session-cumulative usage is tracked per thread, so a second run in a thread adds only its own delta.
const cums=new Map(),alias=new Map();
const real=k=>{while(alias.has(k))k=alias.get(k);return k;};
// A strip keeps the key it was created with, so lookups follow the pending -> real rebind.
export const runCtx=key=>key==null?{}:{get tokens(){return cums.get(real(key))||0;},set tokens(v){cums.set(real(key),v);}};
// A new chat's job is rebound from its pending key to the real thread id; carry the baseline across and keep old ctxs pointing at it.
export const rekeyCtx=(from,to)=>{if(from==null||to==null||from===to)return;if(cums.has(from)){cums.set(to,Math.max(cums.get(from),cums.get(to)||0));cums.delete(from);}alias.set(from,to);};
const name=n=>String(n||'').toLowerCase().replace(/[^a-z]/g,'');
export function verbFor(tool,input){const n=name(tool);
 if(/todo|plan/.test(n))return 'Planning';
 if(/bash|shell|terminal/.test(n))return isTestCommand(input)?'Testing':'Running';
 if(/edit|patch|replace/.test(n))return 'Patching';if(/write|create/.test(n))return 'Writing';
 if(/read|view|cat/.test(n))return 'Reading';if(/grep|glob|search|find|ls/.test(n))return 'Searching';
 if(/todo|plan/.test(n))return 'Planning';return 'Working';}
export function statFor(tool,outcome){if(outcome==='pass')return TOOL_STAT.test;const n=name(tool);
 return /bash|shell|terminal/.test(n)?TOOL_STAT.bash:/edit|patch/.test(n)?TOOL_STAT.edit:/write/.test(n)?TOOL_STAT.write:null;}
export const xpForLevel=l=>25*l*(l-1);
export const levelFor=xp=>{let l=1;while(l<99&&xpForLevel(l+1)<=xp)l++;return l;};
export const stageFor=level=>STAGE_LEVELS.filter(l=>level>=l).length-1;
export const dayKey=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const prevDay=key=>{const[y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d-1).getTime());};
export function streakEnding(days,key){let n=0;while(days.includes(key)){n++;key=prevDay(key);}return n;}
export const ACHIEVEMENTS=[
 ['first-tool','First tool run',s=>s.tools>=1],['first-session','First finished session',s=>s.finished>=1],
 ['first-pass','First passing test',s=>s.passes>=1],['first-rewind','First rewind',s=>s.rewinds>=1],
 ['plan-complete','Plan completed',s=>s.plans>=1],['ten-sessions','10 finished sessions',s=>s.finished>=10],
 ['fifty-sessions','50 finished sessions',s=>s.finished>=50],['ten-passes','10 passing test runs',s=>s.passes>=10],
 ['tokens-100k','100k tokens',s=>s.tokens>=1e5],['tokens-1m','1M tokens',s=>s.tokens>=1e6],
 ['streak-3','3-day streak',s=>s.streak>=3],['streak-7','7-day streak',s=>s.streak>=7],
 ['level-5','Level 5',s=>s.level>=5],['stage-3','Third stage',s=>s.stage>=2]].map(([id,title,test])=>({id,title,test}));
export const initial=()=>({xp:0,level:1,stage:0,tokens:0,tools:0,finished:0,passes:0,rewinds:0,plans:0,days:[],streak:0,stats:{},achievements:{}});
// step(state,event) -> {state,unlocked}; pure, replay-safe.
export function step(s,ev){
 const n={...s,stats:{...s.stats},achievements:{...s.achievements},days:s.days};
 const tokens=Math.max(0,Number(ev.tokens)||0),out=ev.outcome;let earned=tokens>0;
 n.tokens+=tokens;
 if(ev.tool&&(out==='ok'||out==='pass'||out==='fail'))n.tools++;
 if(out==='pass'){n.passes++;earned=true;}
 if(out==='finish'){n.finished++;earned=true;}
 if(out==='rewind')n.rewinds++;if(out==='plan')n.plans++;
 const stat=ev.tool||out==='pass'?statFor(ev.tool,out):null;if(stat&&out!=='fail')n.stats[stat]=(n.stats[stat]||0)+1;
 n.xp=Math.floor(n.tokens/TOKENS_PER_XP)+n.finished*XP_FINISH+n.passes*XP_PASS;
 n.level=levelFor(n.xp);n.stage=stageFor(n.level);
 if(earned){const k=dayKey(ev.ts);if(!n.days.includes(k))n.days=[...n.days,k].sort();}
 n.streak=streakEnding(n.days,dayKey(ev.ts));
 const unlocked=[];for(const a of ACHIEVEMENTS)if(!n.achievements[a.id]&&a.test(n)){n.achievements[a.id]=ev.ts;unlocked.push(a);}
 return {state:n,unlocked};
}
export const reduce=events=>events.reduce((s,e)=>step(s,e).state,initial());
// Streak as shown now: alive only if the last active day is today or yesterday (local date).
export const liveStreak=(s,now=Date.now())=>{const t=dayKey(now);return s.days.includes(t)?streakEnding(s.days,t):streakEnding(s.days,prevDay(t));};
export const progress=s=>{const a=xpForLevel(s.level),b=xpForLevel(s.level+1);return (s.xp-a)/(b-a);};
export const tooltip=s=>[`Level ${s.level}`,`${s.xp} XP`,...Object.entries(s.stats).map(([k,v])=>`${k[0].toUpperCase()+k.slice(1)} ${v}`)].join(' · ');
// Existing worker/thread events -> log events (no new telemetry). ctx keeps per-run state.
export function toLogEvent(ev,ctx,ts=Date.now()){
 if(ev.event==='tool_start'){(ctx.tools??={})[ev.id]={name:ev.name,input:ev.input};return null;}
 if(ev.event==='tool_end'){const t=ctx.tools?.[ev.id];if(!t)return null;const test=verbFor(t.name,t.input)==='Testing';
  return {tool:t.name,tokens:0,outcome:ev.isError?'fail':test?'pass':'ok',ts};}
 if(ev.event==='usage'&&ev.usage){const u=ev.usage,total=Number(u.totalTokens)||(Number(u.inputTokens)||0)+(Number(u.outputTokens)||0),d=Math.max(0,total-(ctx.tokens||0));ctx.tokens=Math.max(ctx.tokens||0,total);return d?{tool:'',tokens:d,outcome:'tokens',ts}:null;}
 return null;
}
