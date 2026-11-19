import {fileLinkPath} from './file-links.js';
import {Marked} from 'marked';
import DOMPurify from 'dompurify';
import {addCodeCopyButtons} from './code-copy.js';
import 'katex/dist/katex.min.css';
import './message-markdown.css';
let library,context;
export function mathToken(source){
 let open,close,display=false,environment=false;for(const pair of [['$$','$$',true],['\\[','\\]',true],['\\(','\\)',false],['$','$',false]])if(source.startsWith(pair[0])){[open,close,display]=pair;break;}
 if(!open){const match=source.match(/^\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|CD)\}/);if(!match)return;open=match[0];close='\\end{'+match[1]+'}';display=environment=true;}
 if(open==='$'&&/\s/.test(source[1]||' '))return;let depth=0;
 for(let i=open.length;i<Math.min(source.length,20000);i++){
  if(depth===0&&source.startsWith(close,i)){if(open==='$'&&(/\s/.test(source[i-1])||/\d/.test(source[i+1]||'')||source.slice(1,i).includes('\n')||source.slice(1,i).includes('`')))return;const raw=source.slice(0,i+close.length),text=environment?raw:source.slice(open.length,i);if(!text.trim())return;return {raw,text,display};}
  if(source[i]==='\\'){i++;continue;}if(source[i]==='{')depth++;else if(source[i]==='}')depth=Math.max(0,depth-1);
 }
}
const placeholder=token=>{const key=context.nonce+'-'+context.formulas.length;context.formulas.push({...token,key});return `<${token.display?'div':'span'} class="message-math" data-suffice-math="${key}"></${token.display?'div':'span'}>`;};
const parser=new Marked({renderer:{link(token){if(fileLinkPath(token.href)!==null){const key=context.nonce+'-file-'+context.files.length;context.files.push({key,href:token.href});return `<a href="#" data-suffice-file="${key}">${this.parser.parseInline(token.tokens)}</a>`;}return false;}},extensions:[
 {name:'latexBlock',level:'block',start:source=>source.search(/(?:^|\n)[ \t]*(?:\$\$|\\\[|\\begin\{)/),tokenizer(source){const leading=source.match(/^[ \t]*/)[0],token=mathToken(source.slice(leading.length));if(!token?.display)return;const tail=source.slice(leading.length+token.raw.length).match(/^[ \t]*(?:\n|$)/);if(!tail)return;return {type:'latexBlock',...token,raw:leading+token.raw+tail[0]};},renderer:placeholder},
 {name:'latexInline',level:'inline',start:source=>source.search(/\$|\\[([]|\\begin\{/),tokenizer(source){const token=mathToken(source);if(token)return {type:'latexInline',...token};},renderer:placeholder},
]});
// Long threads window their markdown: a synchronous batch past BATCH renders is tracked, each tracked
// element is rendered only within 1500px of the viewport and emptied (at its measured height) beyond it,
// so DOM size and layout cost stay bounded. 
const BATCH=8,sources=new WeakMap(),ratio={h:0,n:0};let count=0,batch=[],observer;
const estimate=text=>Math.max(24,Math.ceil(text.length*(ratio.n?ratio.h/ratio.n:.27)));
function release(element){sources.delete(element);element.style.minHeight='';element.removeAttribute('data-lazy-markdown');observer?.unobserve(element);}
// Reading position: the message at the viewport centre is remembered on every scroll. When any observed block
// resizes (lazy fill, KaTeX, diagrams, highlighting) the layout runs before paint and scrollTop is moved so that
// message stays put. Browser anchoring is off (desktop.css) because it ignores changes inside the anchor's ancestors.
const marks=new WeakMap();
function mark(root){const r=root.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.thread-messages > *');marks.set(root,hit&&{hit,y:hit.getBoundingClientRect().top-r.top});}
const resizes=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{const root=entries[0].target.closest('.thread-transcript'),m=root&&marks.get(root);if(!m||!m.hit.isConnected)return;const d=m.hit.getBoundingClientRect().top-root.getBoundingClientRect().top-m.y;if(Math.abs(d)>.5){root.scrollTop+=d;mark(root);}}):null;
const watched=new WeakSet();
function watch(element){const root=element.closest('.thread-transcript');if(root&&!watched.has(root)){watched.add(root);root.addEventListener('scroll',()=>mark(root),{passive:true});mark(root);}resizes?.observe(element);}
// The watchdog chip is appended by the transcript, not part of the markdown: unrendering or re-rendering must not wipe it.
const keepChip=e=>[...e.querySelectorAll(':scope > .claim-chip')];
function apply(hides,shows){
 const sizes=hides.map(e=>e.getBoundingClientRect().height);
 hides.forEach((e,i)=>{if(!sizes[i])return;e.replaceChildren(...keepChip(e));e.dataset.lazyMarkdown='';e.style.minHeight=sizes[i]+'px';});
 for(const e of shows){e.style.minHeight='';e.removeAttribute('data-lazy-markdown');renderNow(e,sources.get(e));}
 for(const e of shows){const h=e.getBoundingClientRect().height;if(h>0){ratio.h+=h;ratio.n+=sources.get(e).length;}}
}
const eligibleHide=e=>sources.has(e)&&!e.hasAttribute('data-lazy-markdown')&&e.isConnected;
const eligibleShow=e=>sources.has(e)&&e.hasAttribute('data-lazy-markdown');
const idleHides=new Set();let idle=0;
// Unrendering is not urgent: defer it to idle time and only for blocks that are still far away.
function flushHides(){idle=0;const out=[...idleHides].filter(eligibleHide);idleHides.clear();if(!out.length)return;const root=out[0].closest('.thread-transcript'),r=root?.getBoundingClientRect(),far=e=>{const b=e.getBoundingClientRect();return r&&(b.bottom<r.top-1500||b.top>r.bottom+1500);};apply(out.filter(far),[]);
 // blocks that just left view are still near: keep them queued (IO fires no second event for them) and look again later
 for(const e of out)if(eligibleHide(e)&&!far(e))idleHides.add(e);if(idleHides.size)idle=setTimeout(flushHides,800);}
function windowObserver(){return observer??=new IntersectionObserver(entries=>{const shows=[];for(const {target,isIntersecting} of entries){if(isIntersecting){idleHides.delete(target);if(eligibleShow(target))shows.push(target);}else if(eligibleHide(target))idleHides.add(target);}
 if(shows.length)apply([],shows);if(idleHides.size&&!idle)idle=(window.requestIdleCallback||setTimeout)(flushHides,{timeout:800});},{rootMargin:'1500px 0px'});}
function track(element,text){watch(element);sources.set(element,text);windowObserver().observe(element);}
export function renderMessageMarkdown(element,text){
 if(typeof IntersectionObserver!=='function'){renderNow(element,text);return;}
 if(!count++)queueMicrotask(()=>{if(count>BATCH)for(const [e,t] of batch)if(e.isConnected&&!sources.has(e))track(e,t);count=0;batch=[];});
 if(count>BATCH){track(element,text);element.replaceChildren();element.dataset.lazyMarkdown='';element.style.minHeight=estimate(text)+'px';return;}
 watch(element);release(element);batch.push([element,text]);renderNow(element,text);
}
function renderNow(element,text){
 const chip=keepChip(element);const current={nonce:crypto.randomUUID(),formulas:[],files:[]};context=current;let html;try{html=parser.parse(text);}finally{context=null;}
 element.innerHTML=DOMPurify.sanitize(html,{USE_PROFILES:{html:true},ALLOW_DATA_ATTR:false,ADD_ATTR:['data-suffice-math','data-suffice-file'],FORBID_TAGS:['img','video','audio','iframe','form','input','button','style'],FORBID_ATTR:['style','id','name']});element.append(...chip);
 for(const file of current.files){const anchor=element.querySelector(`[data-suffice-file="${file.key}"]`);if(anchor)anchor.dataset.sufficeFile=file.href;}
 if(current.formulas.length){library??=import('katex');void library.then(({default:katex})=>{for(const formula of current.formulas){const node=element.querySelector(`[data-suffice-math="${formula.key}"]`);if(!node)continue;node.removeAttribute('data-suffice-math');try{katex.render(formula.text,node,{displayMode:formula.display,throwOnError:false,trust:false,strict:'ignore',maxExpand:1000,maxSize:10,output:'htmlAndMathml',macros:{}});}catch{node.textContent=formula.raw;}}}).catch(()=>{for(const formula of current.formulas){const node=element.querySelector(`[data-suffice-math="${formula.key}"]`);if(node)node.textContent=formula.raw;}});}
 finish(element);
}
const codeTimers=new WeakMap();
function finish(element){
 addCodeCopyButtons(element);clearTimeout(codeTimers.get(element));
 if(element.querySelector('pre code'))codeTimers.set(element,setTimeout(()=>{if(element.isConnected){void import('./mermaid-diagrams.js').then(({renderDiagrams})=>renderDiagrams(element));void import('./code-highlight.js').then(({colorCode})=>Promise.all([...element.querySelectorAll('pre code')].map(code=>colorCode(code,'snippet.'+(code.className.match(/language-([\w+-]+)/)?.[1]||'text'))))).catch(()=>{});}},120));
}
