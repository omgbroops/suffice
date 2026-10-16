import {indexJavaScript} from '../../src/symbol-navigation.mjs';
export const policy={version:'retrieval-v1',budgets:[4096,8192],arms:['lexical','ast','dependency','hybrid'],chunkLines:60,budgetEstimator:'ceil(UTF-8 packet bytes / 3); not model tokens',dependency:'one-hop relative import and reverse import from top three lexical files, score 0.7 seed',ast:'query identifier words substring-match current indexJavaScript symbol names; same 60-line output units',lexical:'BM25 k1=1.2 b=0.75; path repeated twice; lowercase identifier-split words; no learned query rewrite',hybrid:'0.5 normalized lexical + 0.25 normalized AST + 0.25 normalized dependency',packing:'rank descending, path/start tie break, deduplicate source lines, skip oversized units; include packet headers in budget'};
const stop=new Set('the a an and or is are was were this that with from for to of in on it be as at by not have has can when does should return expected actual false true const require https github com js'.split(' '));
export const words=s=>s.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().match(/[a-z_$][a-z0-9_$]{1,}/g)?.filter(w=>!stop.has(w))??[];
export const estimate=s=>Math.ceil(Buffer.byteLength(s,'utf8')/3);
export function build(files){
 const entries=files.map(f=>{try{return {...f,...indexJavaScript(f.source,f.path)}}catch{return {...f,symbols:[],imports:[],parseError:true}}});
 const units=entries.flatMap(f=>{const lines=f.source.split('\n'),u=[];for(let i=0;i<lines.length;i+=60)u.push({path:f.path,start:i+1,end:Math.min(i+60,lines.length),text:lines.slice(i,i+60).join('\n'),symbols:f.symbols.filter(s=>s.start<=i+60&&s.end>=i+1).map(s=>s.name)});return u});
 const docs=units.map(u=>words(u.path+' '+u.path+' '+u.text)),df=new Map();for(const d of docs)for(const w of new Set(d))df.set(w,(df.get(w)??0)+1);
 const avg=docs.reduce((s,d)=>s+d.length,0)/docs.length;
 const neighbors=new Map(entries.map(e=>[e.path,new Set()]));
 for(const e of entries)for(const i of e.imports){if(!i.module.startsWith('.'))continue;const parts=e.path.split('/');parts.pop();for(const p of i.module.split('/'))if(p==='..')parts.pop();else if(p!=='.')parts.push(p);const base=parts.join('/');const target=[base,base+'.js',base+'.ts',base+'/index.js',base+'/index.ts'].find(p=>neighbors.has(p));if(target){neighbors.get(e.path).add(target);neighbors.get(target).add(e.path)}}
 return {entries,units,docs,df,avg,neighbors};
}
export function rank(index,query,arm){
 const q=[...new Set(words(query))],n=index.units.length;
 const lex=index.docs.map(d=>q.reduce((s,w)=>{const tf=d.filter(x=>x===w).length;if(!tf)return s;const idf=Math.log(1+(n-(index.df.get(w)??0)+.5)/((index.df.get(w)??0)+.5));return s+idf*tf*2.2/(tf+1.2*(.25+.75*d.length/index.avg))},0));
 const ast=index.units.map(u=>q.reduce((s,w)=>s+u.symbols.filter(name=>name.toLowerCase().includes(w)).length,0));
 const fileScores=new Map();lex.forEach((s,i)=>fileScores.set(index.units[i].path,Math.max(s,fileScores.get(index.units[i].path)??0)));
 const seeds=[...fileScores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3);
 const dep=lex.map((s,i)=>Math.max(s,...seeds.filter(([p])=>index.neighbors.get(p).has(index.units[i].path)).map(([,score])=>score*.7)));
 const norm=a=>{const max=Math.max(...a,1e-9);return a.map(x=>x/max)},l=norm(lex),a=norm(ast),d=norm(dep);
 const scores=arm==='lexical'?lex:arm==='ast'?ast:arm==='dependency'?dep:l.map((s,i)=>.5*s+.25*a[i]+.25*d[i]);
 return index.units.map((u,i)=>({...u,score:scores[i]})).filter(u=>u.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)||a.start-b.start);
}
export function pack(ranked,budget){let text='';const selected=[];for(const u of ranked){const fragment=`\n### ${u.path}:${u.start}-${u.end}\n${u.text}\n`;if(estimate(text+fragment)>budget)continue;text+=fragment;selected.push({path:u.path,start:u.start,end:u.end,score:u.score})}return {text,estimatedTokens:estimate(text),selected}}
