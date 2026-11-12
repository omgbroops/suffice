const prefix='suffice-thread-view-v1:';
const empty=()=>({draft:'',panelOpen:false,tabs:[],activeTab:null,panelWidth:null,scrollTop:0,following:true,model:null,files:{directory:'',file:null,scroll:0,expanded:[],query:'',filterOpen:false,explorerOpen:true,explorerWidth:null,recent:[]},changes:{file:null,scroll:0,collapsed:[],query:'',filterOpen:false,explorerOpen:true,explorerWidth:null,recent:[]}});
function normalize(value){
 const defaults=empty(),state={...defaults,...value};
 state.files={...defaults.files,...value?.files};state.changes={...defaults.changes,...value?.changes};
 state.draft=typeof state.draft==='string'?state.draft:'';
 state.tabs=[...new Set(Array.isArray(state.tabs)?state.tabs.filter(tab=>['files','changes'].includes(tab)):[])];
 state.activeTab=state.tabs.includes(state.activeTab)?state.activeTab:state.tabs[0]??null;
 return state;
}
export function createThreadViewStore(storage){
 const cache=new Map(),listeners=new Set();let active=null;
 const key=id=>id??'new';
 function read(id){const name=key(id);if(!cache.has(name)){let value;try{value=JSON.parse(storage.getItem(prefix+name));}catch{}cache.set(name,normalize(value));}return cache.get(name);}
 function write(id,state){cache.set(key(id),state);try{storage.setItem(prefix+key(id),JSON.stringify(state));}catch{/* A full or unavailable preference store must not block typing. */}}
 const notify=event=>listeners.forEach(listener=>listener(event));
 return {
  get id(){return active;},get state(){return read(active);},read,
  select(id){active=id??null;notify({type:'select',id:active,state:read(active)});},
  update(patch){const state=normalize({...read(active),...patch});write(active,state);notify({type:'update',id:active,state,changed:Object.keys(patch)});},
  adopt(id){if(!id||id===active)return;const previous=active;write(id,read(active));try{storage.removeItem(prefix+key(previous));}catch{}cache.delete(key(previous));active=id;notify({type:'adopt',id,state:read(id)});},
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
 };
}
export const threadViewState=createThreadViewStore({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
