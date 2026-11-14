import {createRovingFocus,createTypeahead,definePrimitive,isTypeaheadKey,labelOf} from '@ui-sdk/core';

// A DOM adapter keeps legacy markup and styling while UI SDK owns focus behavior.
export function createCollectionNavigation(root,{items=()=>root.querySelectorAll('button'),orientation='vertical',tabStop=false,preferred=()=>false,key=element=>element.getAttribute('aria-label')||labelOf(element),onNavigate}={}){
 const bindings=new Map(),typeahead=createTypeahead();
 const primitive=definePrimitive({
  name:'suffice-collection',
  state:()=>({focused:null}),
  api:context=>({roving:createRovingFocus(context,{
   slot:'item',key:'focused',orientation:()=>orientation,loop:()=>true,
   remember:!tabStop,preferred:item=>preferred(item.props.element),
   focusable:item=>!item.props.element.disabled&&item.props.element.getAttribute('aria-disabled')!=='true',
  })}),
  slots:()=>({}),
 });
 const instance=primitive({}),roving=instance.api.roving;
 function paint(){if(tabStop)for(const [element,{part}] of bindings)element.tabIndex=Number(roving.tabIndex(instance.get(),part));}
 const unsubscribe=instance.subscribe(paint);
 function sync(){
  const current=new Set(items());
  for(const [element,binding] of bindings)if(!current.has(element)){binding.unbind();bindings.delete(element);}
  for(const element of current)if(!bindings.has(element)){
   const part={key:key(element),props:{element}};
   bindings.set(element,{part,unbind:roving.bind(element,part)});
  }
  roving.check();paint();
 }
 function keydown(event){
  if(event.defaultPrevented||event.isComposing)return;
  sync();
  const field=event.target.closest?.('input,textarea,[contenteditable="true"]');
  if(field&&['Home','End','ArrowLeft','ArrowRight'].includes(event.key))return;
  const element=[...bindings.keys()].find(item=>item===event.target||item.contains(event.target));
  const moved=element?roving.keydown(event,element):undefined;
  if(moved){typeahead.reset();const target=roving.items().find(item=>item.key===moved.key)?.el;if(target)onNavigate?.(target,event);return;}
  if(field||!isTypeaheadKey(event)||event.key===' '&&!typeahead.active())return;
  const available=roving.items(),current=available.findIndex(item=>item.el===element);
  const index=typeahead(event.key,available.map(item=>item.el.getAttribute('aria-label')||labelOf(item.el)),current);
  if(index!==-1){event.preventDefault();roving.focus(available[index].key);onNavigate?.(available[index].el,event);}
 }
 return {
  sync,keydown,
  reset:()=>typeahead.reset(),
  focus(element){sync();if(element&&bindings.has(element))roving.focus(bindings.get(element).part.key);},
  destroy(){typeahead.reset();for(const binding of bindings.values())binding.unbind();bindings.clear();unsubscribe();instance.destroy();},
 };
}
