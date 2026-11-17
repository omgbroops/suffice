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
// Long threads: only the first EAGER messages of a synchronous render are parsed now; the rest
// render when scrolled within 1500px, which keeps open time and DOM size bounded.
const EAGER=40,pending=new WeakMap();let eager=0,observer;
function lazyObserver(){return observer??=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const text=pending.get(entry.target);observer.unobserve(entry.target);if(text===undefined)continue;pending.delete(entry.target);entry.target.style.minHeight='';entry.target.removeAttribute('data-lazy-markdown');renderNow(entry.target,text);addCodeCopyButtons(entry.target);}},{rootMargin:'1500px 0px'});}
export function renderMessageMarkdown(element,text){
 if(!eager++)queueMicrotask(()=>{eager=0;});
 if(eager>EAGER&&typeof IntersectionObserver==='function'){pending.set(element,text);element.dataset.lazyMarkdown='';element.style.minHeight=Math.max(24,Math.ceil(text.length/90)*24)+'px';lazyObserver().observe(element);return;}
 pending.delete(element);renderNow(element,text);
}
function renderNow(element,text){
 const current={nonce:crypto.randomUUID(),formulas:[],files:[]};context=current;let html;try{html=parser.parse(text);}finally{context=null;}
 element.innerHTML=DOMPurify.sanitize(html,{USE_PROFILES:{html:true},ALLOW_DATA_ATTR:false,ADD_ATTR:['data-suffice-math','data-suffice-file'],FORBID_TAGS:['img','video','audio','iframe','form','input','button','style'],FORBID_ATTR:['style','id','name']});
 for(const file of current.files){const anchor=element.querySelector(`[data-suffice-file="${file.key}"]`);if(anchor)anchor.dataset.sufficeFile=file.href;}
 if(current.formulas.length){library??=import('katex');void library.then(({default:katex})=>{for(const formula of current.formulas){const node=element.querySelector(`[data-suffice-math="${formula.key}"]`);if(!node)continue;node.removeAttribute('data-suffice-math');try{katex.render(formula.text,node,{displayMode:formula.display,throwOnError:false,trust:false,strict:'ignore',maxExpand:1000,maxSize:10,output:'htmlAndMathml',macros:{}});}catch{node.textContent=formula.raw;}}}).catch(()=>{for(const formula of current.formulas){const node=element.querySelector(`[data-suffice-math="${formula.key}"]`);if(node)node.textContent=formula.raw;}});}
}
