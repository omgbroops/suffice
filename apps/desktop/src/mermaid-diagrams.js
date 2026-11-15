import DOMPurify from 'dompurify';
let library,sequence=0,queue=Promise.resolve();
export function renderDiagrams(element){
 for(const code of element.querySelectorAll('pre code.language-mermaid')){
  const source=code.textContent;if(source.length>30000)continue;
  const pre=code.parentElement;pre.dataset.diagram='pending';
  queue=queue.catch(()=>{}).then(async()=>{
   if(!pre.isConnected)return;
   const links=[];
   const diagram=source.split('\n').filter(line=>{if(!/^\s*click\s/.test(line))return true;const match=line.match(/^\s*click\s+([\w-]+)\s+(?:href\s+)?"(https:\/\/[^"\s]+)"(?:\s+"([^"]*)")?/);if(match){try{const url=new URL(match[2]);if(!url.username&&!url.password)links.push({id:match[1],url:url.href,label:match[3]});}catch{}}return false;}).join('\n');
   if(/(?:https?:\/\/|data:|javascript:|file:|@import|url\s*\(|\bimg\s*:)/i.test(diagram)){pre.dataset.diagram='source';return;}
   try{
    library??=(await import('mermaid')).default;
    const dark=document.documentElement.dataset.theme!=='light',ink=dark?'#ededed':'#202020';
    library.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:30000,htmlLabels:false,flowchart:{htmlLabels:false},theme:'base',themeVariables:{darkMode:dark,primaryColor:dark?'#252525':'#f1f1f1',primaryTextColor:ink,primaryBorderColor:dark?'#777777':'#b0b0b0',lineColor:dark?'#aaaaaa':'#666666',textColor:ink,pie1:'#7b9ed5',pie2:'#a995d6',pie3:'#7cb59b',pie4:'#d59c77',pie5:'#d799aa',pieSectionTextColor:'#202020',pieLegendTextColor:ink,pieTitleTextColor:ink}});
    const {svg}=await library.render('suffice-diagram-'+(++sequence),diagram);if(!pre.isConnected)return;
    const figure=document.createElement('figure');figure.className='thread-diagram';figure.setAttribute('aria-label','Mermaid diagram');
    figure.innerHTML=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','script','image','a'],FORBID_ATTR:['onload','onclick','onerror']});
    for(const link of links){const node=[...figure.querySelectorAll('g.node')].find(node=>node.getAttribute('data-id')===link.id||node.id.split(/[-_]/).includes(link.id));if(!node)continue;node.setAttribute('role','link');node.setAttribute('tabindex','0');node.setAttribute('aria-label',link.label||link.url);node.classList.add('diagram-link');const open=event=>{event.preventDefault();void window.sufficeDesktop.openExternal(link.url);};node.addEventListener('click',open);node.addEventListener('keydown',event=>{if(event.key==='Enter')open(event);});}
    pre.replaceWith(figure);
   }catch{pre.dataset.diagram='source';}
  });
 }
 return queue;
}
