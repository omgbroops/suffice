import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {Type} from 'typebox';
// Clean-room page-to-markdown (readability scoring + markdown writer). Idea only from Firecrawl-class tools (AGPL-3.0, github.com/mendableai/firecrawl) and Mozilla Readability (Apache-2.0); no code copied.
const VOID=new Set(['br','hr','img','input','meta','link','source','wbr','col','area','base','embed','track']);
const DROP=new Set(['script','style','noscript','svg','template','iframe','form','nav','header','footer','aside','button','select','dialog','canvas','video','audio','object','head']);
const NEGATIVE=/(^|[\s_-])(nav|navbar|menu|sidebar|footer|header|cookie|consent|banner|advert|ads|promo|share|social|comment|related|newsletter|popup|modal|breadcrumb)([\s_-]|$)/i;
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–',hellip:'…',copy:'©',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'};
export const decode=s=>s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(m,e)=>{if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<0x110000?String.fromCodePoint(n):m;}return ENTITIES[e.toLowerCase()]??m;});
export const estimateTokens=n=>Math.ceil(n/4);
function attrs(src){const out={};for(const m of src.matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');return out;}
// shortcut: no implied end tags (<p>/<li> without </p>), unmatched closers are ignored; fine for readable text, upgrade if a real page loses content.
export function parseHtml(html){
 const root={tag:'#root',attrs:{},children:[]};const stack=[root];const re=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gy;let at=0;
 const text=s=>{if(s)stack.at(-1).children.push({text:decode(s)});};
 for(let m;at<html.length;){re.lastIndex=at;m=re.exec(html);if(!m){const next=html.indexOf('<',at+1);const end=next<0?html.length:next;text(html.slice(at,end));at=end;continue;}at=re.lastIndex;if(!m[2])continue;
  const tag=m[2].toLowerCase();
  if(m[1]){const i=stack.findLastIndex(n=>n.tag===tag);if(i>0)stack.length=i;continue;}
  const node={tag,attrs:attrs(m[3].replace(/\/$/,'')),children:[]};stack.at(-1).children.push(node);
  if(tag==='script'||tag==='style'){const close=html.toLowerCase().indexOf('</'+tag,at);at=close<0?html.length:close;continue;}
  if(!VOID.has(tag)&&!/\/\s*$/.test(m[3]))stack.push(node);
 }
 return root;
}
const textOf=n=>n.text!==undefined?n.text:n.children.map(textOf).join('');
const linkText=n=>n.tag==='a'?textOf(n).length:n.children?.reduce((s,c)=>s+(c.text!==undefined?0:linkText(c)),0)||0;
const squash=s=>s.replace(/\s+/g,' ').trim();
const find=(n,fn,out=[])=>{if(n.text===undefined){if(fn(n))out.push(n);for(const c of n.children)find(c,fn,out);}return out;};
function clean(n){if(n.text!==undefined)return;n.children=n.children.filter(c=>{if(c.text!==undefined)return true;if(DROP.has(c.tag)||c.attrs.hidden!==undefined||c.attrs['aria-hidden']==='true')return false;if(NEGATIVE.test((c.attrs.class||'')+' '+(c.attrs.id||''))&&c.tag!=='body'&&c.tag!=='html'&&c.tag!=='article'&&c.tag!=='main')return false;return true;});n.children.forEach(clean);}
export function pickMain(root){
 const body=find(root,n=>n.tag==='body')[0]||root;
 const semantic=find(body,n=>n.tag==='article'||n.tag==='main'||n.attrs.role==='main').find(n=>squash(textOf(n)).length>=200);
 if(semantic)return semantic;
 // Score block containers by their own paragraph text, penalised by link density.
 let best=body,top=-1;for(const n of find(body,n=>['div','section','body'].includes(n.tag))){const own=n.children.filter(c=>c.tag==='p').reduce((s,c)=>s+squash(textOf(c)).length,0),all=squash(textOf(n)).length||1,density=linkText(n)/all,score=(own+all*0.1)*(1-Math.min(density,1));if(score>top){top=score;best=n;}}
 return best;
}
const url=(href,base)=>{try{const u=new URL(href,base);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
export function toMarkdown(root,base){
 let out='';const nl=n=>{out=out.replace(/[ \t]+$/,'');const have=out.match(/\n*$/)[0].length;if(out&&have<n)out+='\n'.repeat(n-have);};
 const inline=n=>n.text!==undefined?n.text.replace(/\s+/g,' '):n.children.map(c=>walk(c,{list:[]},true)).join('');
 function walk(n,ctx,asInline=false){
  if(n.text!==undefined){if(asInline)return n.text.replace(/\s+/g,' ');if(/\S/.test(n.text)){out+=/\s$/.test(out)||!out?n.text.replace(/\s+/g,' ').replace(/^ /,''):n.text.replace(/\s+/g,' ');}return '';}
  const t=n.tag,kids=()=>n.children.map(c=>walk(c,ctx,true)).join('');
  if(asInline){
   if(t==='a'){const h=url(n.attrs.href||'',base),s=squash(kids());return h&&s?`[${s}](${h})`:s;}
   if(t==='strong'||t==='b'){const s=squash(kids());return s?`**${s}**`:'';}
   if(t==='em'||t==='i'){const s=squash(kids());return s?`*${s}*`:'';}
   if(t==='code'){const s=textOf(n);return s.trim()?'`'+s.replace(/`/g,"'")+'`':'';}
   if(t==='br')return '  \n';
   if(t==='img'){const s=url(n.attrs.src||'',base);return s?`![${squash(n.attrs.alt||'')}](${s})`:'';}
   if(/^(p|div|li|ul|ol|h[1-6]|pre|blockquote|table|section|article|tr)$/.test(t))return ' '+kids()+' ';
   return kids();
  }
  if(/^h[1-6]$/.test(t)){const s=squash(kids());if(s){nl(2);out+='#'.repeat(+t[1])+' '+s;nl(2);}return '';}
  if(t==='p'){const s=squash(kids());if(s){nl(2);out+=s;nl(2);}return '';}
  if(t==='pre'){const s=textOf(n).replace(/\n+$/,'');if(s.trim()){nl(2);out+='```\n'+s.replace(/```/g,"'''")+'\n```';nl(2);}return '';}
  if(t==='blockquote'){const s=squash(kids());if(s){nl(2);out+='> '+s;nl(2);}return '';}
  if(t==='hr'){nl(2);out+='---';nl(2);return '';}
  if(t==='ul'||t==='ol'){nl(1);let i=0;for(const c of n.children){if(c.tag!=='li')continue;i++;const inner={...c,children:c.children.filter(x=>x.tag!=='ul'&&x.tag!=='ol')},s=squash(inner.children.map(x=>walk(x,ctx,true)).join(''));const pad='  '.repeat(ctx.list.length);if(s){nl(1);out+=`${pad}${t==='ol'?i+'.':'-'} ${s}`;}for(const sub of c.children.filter(x=>x.tag==='ul'||x.tag==='ol'))walk(sub,{...ctx,list:[...ctx.list,t]});}nl(2);return '';}
  if(t==='table'){const rows=find(n,r=>r.tag==='tr').map(r=>r.children.filter(c=>c.tag==='td'||c.tag==='th').map(c=>squash(inlineOf(c)).replace(/\|/g,'\\|')));const w=Math.max(0,...rows.map(r=>r.length));if(w){nl(2);rows.forEach((r,i)=>{out+='| '+[...r,...Array(w-r.length).fill('')].join(' | ')+' |\n';if(i===0)out+='|'+' --- |'.repeat(w)+'\n';});nl(2);}return '';}
  if(/^(a|strong|b|em|i|code|img)$/.test(t)){const s=walk(n,ctx,true);if(s.trim())out+=(out&&!/\s$/.test(out)?' ':'')+s;return '';}
  for(const c of n.children)walk(c,ctx);
  if(/^(div|section|article|main|figure|li|tr|dl|dt|dd|figcaption)$/.test(t))nl(1);
  return '';
 }
 const inlineOf=c=>c.children.map(x=>walk(x,{list:[]},true)).join('');
 walk(root,{list:[]});
 return out.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function pageToMarkdown(html,base){
 const root=parseHtml(html);const meta=name=>find(root,n=>n.tag==='meta'&&(n.attrs.property===name||n.attrs.name===name))[0]?.attrs.content;
 const titleNode=find(root,n=>n.tag==='title')[0],h1=find(root,n=>n.tag==='h1')[0];
 const title=squash(meta('og:title')||(titleNode&&textOf(titleNode))||(h1&&textOf(h1))||'');
 const links=find(root,n=>n.tag==='a'&&n.attrs.href).map(n=>url(n.attrs.href.split('#')[0],base)).filter(Boolean);
 clean(root);const markdown=toMarkdown(pickMain(root),base);
 return {title,markdown,links:[...new Set(links)]};
}
const PRIVATE=/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:|::ffff:(127|10|0|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i;
export async function assertPublic(href,{allowPrivate=false}={}){
 const u=new URL(href);if(!/^https?:$/.test(u.protocol))throw new Error('Only http and https URLs can be fetched');
 if(allowPrivate)return u;const host=u.hostname.replace(/^\[|\]$/g,'');
 const addrs=isIP(host)?[host]:(await lookup(host,{all:true})).map(a=>a.address);
 if(host==='localhost'||host.endsWith('.localhost')||addrs.some(a=>PRIVATE.test(a)))throw new Error('Refusing to fetch a private or local address');
 return u;
}
export async function fetchCapped(href,{fetchImpl=fetch,maxBytes=2_000_000,timeoutMs=15000,allowPrivate=false,signal}={}){
 let current=href;
 for(let hop=0;hop<=5;hop++){
  await assertPublic(current,{allowPrivate});
  const res=await fetchImpl(current,{redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]),headers:{'user-agent':'SufficeCrawl/1.0 (+local markdown reader)',accept:'text/html,application/xhtml+xml,text/plain;q=0.8'}});
  if(res.status>=300&&res.status<400&&res.headers.get('location')){current=new URL(res.headers.get('location'),current).href;continue;}
  if(!res.ok)throw new Error(`HTTP ${res.status} for ${current}`);
  const type=res.headers.get('content-type')||'';if(type&&!/text\/|xml|json/.test(type))throw new Error(`Unsupported content type ${type}`);
  const chunks=[];let bytes=0,capped=false;
  for await(const chunk of res.body){bytes+=chunk.length;chunks.push(chunk);if(bytes>=maxBytes){capped=true;break;}}
  return {url:current,type,bytes,capped,html:Buffer.concat(chunks).subarray(0,maxBytes).toString('utf8')};
 }
 throw new Error('Too many redirects');
}
export async function crawlToMarkdown(start,{maxPages=1,maxChars=20000,...opts}={}){
 maxPages=Math.min(Math.max(1,maxPages|0||1),10);maxChars=Math.min(Math.max(500,maxChars|0||20000),100000);
 const seen=new Set([start]),queue=[start],pages=[];let rawBytes=0,chars=0,truncated=false;const origin=new URL(start).origin;
 while(queue.length&&pages.length<maxPages&&!truncated){
  const target=queue.shift();let got;try{got=await fetchCapped(target,opts);}catch(error){if(!pages.length)throw error;continue;}
  rawBytes+=got.bytes;const page=/html|xml/.test(got.type)||/^\s*</.test(got.html)?pageToMarkdown(got.html,got.url):{title:'',markdown:got.html.trim(),links:[]};
  let body=page.markdown;const room=maxChars-chars;if(body.length>room){body=body.slice(0,room)+'\n\n[truncated]';truncated=true;}
  chars+=body.length;pages.push({url:got.url,title:page.title,markdown:body});
  for(const l of page.links)if(l.startsWith(origin)&&!seen.has(l)){seen.add(l);queue.push(l);}
 }
 const text=pages.map(p=>`# ${p.title||p.url}\n<${p.url}>\n\n${p.markdown}`).join('\n\n---\n\n');
 const tokens=estimateTokens(text.length),rawTokens=estimateTokens(rawBytes);
 return {text,details:{url:start,title:pages[0]?.title||'',pages:pages.length,bytes:rawBytes,markdownBytes:Buffer.byteLength(text),tokens,savedTokens:Math.max(0,rawTokens-tokens),truncated}};
}
export function crawlTool(opts={}){
 return {name:'crawl_to_markdown',label:'Crawl to Markdown',exposure:'deferred',
  description:'Fetch a web page (optionally follow same-site links) and return clean markdown with navigation, scripts and ads removed. Public http(s) only; output is size capped.',
  promptSnippet:'Use to read a page as compact markdown; set maxPages to crawl same-site links.',
  parameters:Type.Object({url:Type.String({description:'http or https URL'}),maxPages:Type.Optional(Type.Integer({minimum:1,maximum:10,description:'Same-site pages to read, default 1'})),maxChars:Type.Optional(Type.Integer({minimum:500,maximum:100000,description:'Output cap in characters, default 20000'}))}),
  async execute(_id,params,signal){const {text,details}=await crawlToMarkdown(params.url,{maxPages:params.maxPages,maxChars:params.maxChars,signal,...opts});return {content:[{type:'text',text}],details};}};
}
