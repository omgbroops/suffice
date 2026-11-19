// Watchdog in the transcript: an agent message that claims "tests pass" / "build succeeds" / "updated x.js"
// gets a verified / failed chip. Checked against the tool items of the same turn with packages/backend/src/watchdog.
import {verifyClaim,rank} from '../../../packages/backend/src/watchdog/index.mjs';

const NEG=/\b(?:not|never|unable|still)\b|n't/i;
const CHANGE='updated|edited|modified|changed|created|wrote|fixed|rewrote|refactored|added';
const BRAND=/^(?:node|next|vue|react|three|d3|chart|express|nuxt|socket|alpine|p5|deno|bun|ember|backbone)\.(?:js|ts|io)$/i;
const PATH=/^[\w./-]+\.[A-Za-z]{1,5}$/;
const KINDS=[
 {kind:'tests',re:/\b(?:all\s+)?(?:\w+\s+)?tests?\s+(?:are\s+|now\s+|all\s+)*(?:pass(?:ed|es|ing)?|green)\b|\bpassing tests?\b/i,label:'Tests pass',cmd:/test|spec|jest|vitest|pytest|mocha|check/i},
 {kind:'exit',re:/\bbuild\s+(?:succeeds|succeeded|passes|passed|is green)\b|\bbuilds?\s+(?:cleanly|successfully)\b|\bcompiles?\s+(?:cleanly|successfully)\b/i,label:'Build succeeds',cmd:/build|compile|tsc|cargo|make|vite|webpack/i},
 {kind:'exit',re:/\blint\s+(?:passes|passed|is clean)\b|\bno lint errors\b/i,label:'Lint clean',cmd:/lint|tsc/i},
];
const base=p=>String(p).split('/').filter(Boolean).pop()||'';

export function extractClaims(text){
 const out=[],seen=new Set();
 const add=c=>{const k=c.kind+':'+(c.path||c.label);if(!seen.has(k)){seen.add(k);out.push(c);}};
 for(const s of String(text||'').split(/(?<=[.!?])\s+|\n+/)){
  if(NEG.test(s))continue;
  for(const k of KINDS)if(k.re.test(s))add(k.kind==='tests'?{kind:'tests',passed:true,label:k.label,cmd:k.cmd}:{kind:'exit',code:0,label:k.label,cmd:k.cmd});
  if(new RegExp(`\\b(?:${CHANGE})\\b`,'i').test(s)){
   for(const m of s.matchAll(/`([^`\s]+)`/g))if(PATH.test(m[1])&&!BRAND.test(m[1]))add({kind:'file',path:m[1],label:base(m[1])});
   for(const m of s.matchAll(new RegExp(`\\b(?:${CHANGE})\\s+(?:the\\s+|file\\s+)*([\\w./-]+\\.[A-Za-z]{1,5})\\b`,'gi')))if(!BRAND.test(m[1]))add({kind:'file',path:m[1],label:base(m[1])});
  }
 }
 return out;
}

const target=it=>{const i=it.input||{};return String(i.file_path||i.path||i.filePath||i.notebook_path||it.output?.diff?.[0]?.path||'');};
const code=it=>it.output?.exitCode??(it.status==='error'||it.status==='denied'||it.status==='interrupted'?1:0);

// items: the visible items in display order. Returns Map(assistant item id -> {state,claims,sig}).
export function claimsFor(items){
 const res=new Map();let turn=0;
 items.forEach((it,i)=>{
  if(it.kind==='user'){turn=i+1;return;}
  if(it.kind!=='assistant'||it.pending)return;
  const claims=extractClaims(it.text);if(!claims.length)return;
  const prior=items.slice(turn,i),shells=prior.filter(x=>x.kind==='tool'&&x.category==='shell');
  const findings=[],rows=[];
  for(const c of claims){
   let row;
   if(c.kind==='file'){
    const hit=prior.find(x=>x.kind==='tool'&&(((x.category==='edit'||x.category==='write')&&(base(target(x))===c.label))||(x.category==='shell'&&String(x.input?.command||'').includes(c.label))));
    row=hit?{ok:true}:{ok:false,reason:`no edit or write of ${c.path} in this turn`};
   }else{
    const mine=shells.filter(x=>c.cmd.test(String(x.input?.command||'')));
    if(mine.some(x=>x.status==='running'))row={pending:true};
    else{
     const events=mine.map(x=>({type:'exec',seq:prior.indexOf(x)+1,data:{command:String(x.input?.command||''),code:code(x)}}));
     const v=verifyClaim(c,events,{seq:prior.length+1});
     row=v.ok?{ok:true}:{ok:false,reason:mine.at(-1)?.status==='interrupted'?'last matching command was stopped before it finished':v.reason==='no exec event backs this claim'?`no matching command ran in this turn`:v.reason.replace('exec exited','last matching command exited')};
     if(v.ok){const l=events.reduce((m,e)=>!m||e.seq>m.seq?e:m,null);row.cmd=l?.data.command;}
     else if(events.length)row.cmd=events.at(-1).data.command;
    }
   }
   row.label=c.label;row.kind=c.kind;rows.push(row);
   if(row.ok===false)findings.push({runId:'t',kind:'claim-mismatch',severity:'high',evidence:row,ts:i});
  }
  const state=rows.some(r=>r.pending)?'checking':findings.length?'failed':'verified';
  const failed=rank(findings).map(f=>f.evidence),ordered=[...failed,...rows.filter(r=>!failed.includes(r))];
  res.set(it.id,{state,rows,failed,ordered,sig:state+':'+rows.map(r=>r.label+(r.ok?'+':r.pending?'?':'-')).join(',')});
 });
 return res;
}

const svg=d=>`<svg class="claim-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON={verified:'<path d="m3.5 8.5 3 3 6-7"/>',failed:'<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.3h.01"/>',checking:'<path d="M8 3v3M8 10v3M3 8h3M10 8h3"/>'};
const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n;};

let uid=0;
export function attachClaimChip(article,v){
 const old=article.querySelector(':scope > .claim-chip');if(old){old._close?.();old.remove();}
 if(!v)return;
 const n=v.rows.length,bad=v.failed.length;
 const text=v.state==='checking'?'Checking claims':v.state==='failed'?`${bad} of ${n} unverified`:n===1?`Verified: ${v.rows[0].label}`:`${n} claims verified`;
 const chip=el('span','claim-chip');chip.dataset.state=v.state;chip.tabIndex=0;chip.setAttribute('role','status');
 chip.innerHTML=svg(ICON[v.state]);chip.append(el('span','claim-text',text));
 const pop=el('div','claim-detail');pop.setAttribute('role','tooltip');chip._close=()=>{clearInterval(pop._t);pop.remove();};
 const ordered=v.ordered,sr=el('span','claim-sr');sr.id='claim-d'+(++uid);chip.setAttribute('aria-describedby',sr.id);
 sr.textContent=ordered.map(r=>r.label+': '+(r.pending?'command still running':r.ok?(r.cmd||'edit found'):r.reason)).join('. ');chip.append(sr);
 for(const r of ordered){
  const row=el('div','claim-row');row.dataset.state=r.pending?'checking':r.ok?'verified':'failed';
  row.innerHTML=svg(ICON[row.dataset.state]);
  const body=el('span','claim-body');body.append(el('span','claim-label',r.label));
  const why=r.pending?'command still running':r.ok?(r.cmd||'edit found'):r.reason;
  body.append(el('span','claim-why',why));row.append(body);pop.append(row);
 }
 // The detail lives on <body> while open: message rows use content-visibility, which clips anything that overflows them.
 const open=()=>{document.querySelector('body > .claim-detail')?.remove();document.body.append(pop);pop.dataset.open='';clearInterval(pop._t);pop._t=setInterval(()=>{if(!chip.isConnected)close();},100);const r=chip.getBoundingClientRect(),h=pop.offsetHeight;const right=r.right+8+pop.offsetWidth<=innerWidth-8;pop.style.left=(right?r.right+8:Math.max(8,r.left))+'px';pop.style.top=Math.max(8,Math.min(right?r.top+r.height/2-h/2:r.bottom+4,innerHeight-h-8))+'px';};
 // a re-render replaces the whole message node, so the chip can vanish under an open detail without any pointer event
 const close=()=>{clearInterval(pop._t);pop.remove();};
 for(const [a,f] of [['pointerenter',open],['pointerleave',close],['focus',open],['blur',close]])chip.addEventListener(a,f);
 article.append(chip);
}
