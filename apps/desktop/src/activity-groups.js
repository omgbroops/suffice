import {icon} from './ui.js';
const connected=new WeakSet();
export function decorateActivitySummary(summary,label){
 const glyphs=[];if(/nam(?:ed|ing) session/i.test(label))glyphs.push('pencil');if(/(?:executed|running) code/i.test(label))glyphs.push('code');if(/read|list.*files/i.test(label))glyphs.push('files');if(/edit|writ|wrote/i.test(label))glyphs.push('pencil');if(/bash|powershell|command/i.test(label))glyphs.push('terminal');if(/browser|tabs|web|search results/i.test(label))glyphs.push('search');if(!glyphs.length)glyphs.push('gear');
 const marks=document.createElement('span');marks.className='activity-icons';marks.innerHTML=[...new Set(glyphs)].map(name=>icon(name)).join('');const text=document.createElement('span');text.className='activity-label';text.textContent=label;summary.replaceChildren(marks,text);summary.title=label;
}
export function joinActivityLabels(labels){
 const seen=new Set(),unique=labels.flatMap(label=>label.split(', ')).filter(label=>{const key=label.toLowerCase();if(!label||seen.has(key))return false;seen.add(key);return true;});
 return unique.map((label,index)=>index?label[0].toLowerCase()+label.slice(1):label).join(', ');
}
export function syncActivityGroup(group){
 if(!connected.has(group)){connected.add(group);group.addEventListener('activity-label-change',()=>syncActivityGroup(group));}
 const log=group.querySelector(':scope > .thread-activity-log');if(!log)return;
 const widgets=[...log.children].filter(child=>child.classList.contains('tool-widget'));
 if(!widgets.length)return;
 const single=widgets.length===1&&log.children.length===1,wasSingle=group.dataset.single==='true';
 group.dataset.single=String(single);
 if(single)widgets[0].open=true;
 else if(wasSingle)widgets[0].open=false;
 const summary=group.querySelector(':scope > summary');decorateActivitySummary(summary,joinActivityLabels(widgets.map(widget=>(summary=>summary.dataset.label||summary.textContent)(widget.querySelector(':scope > summary')))));
}
