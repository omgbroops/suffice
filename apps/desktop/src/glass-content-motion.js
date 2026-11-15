// Fade content, never a glass backing or an ancestor that contains one.
const running=new WeakMap();
export function fadeGlassContent(root,{delay=0,duration=180}={}){
 running.get(root)?.();
 if(document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const glassAncestors=new Set([root]),animations=[];
 for(const element of [root,...root.querySelectorAll('*')]){
  if(getComputedStyle(element).backdropFilter==='none')continue;
  for(let node=element;node&&root.contains(node);node=node.parentElement)glassAncestors.add(node);
 }
 function visit(element){
  if(glassAncestors.has(element)){for(const child of element.children)visit(child);return;}
  animations.push(element.animate([{opacity:0},{opacity:1}],{duration,delay,easing:getComputedStyle(root).getPropertyValue('--ease-out').trim()||'ease-out',fill:'backwards'}));
 }
 visit(root);
 const cancel=()=>{for(const animation of animations)animation.cancel();running.delete(root);};
 running.set(root,cancel);
 Promise.all(animations.map(animation=>animation.finished)).then(cancel).catch(()=>{});
 return cancel;
}
