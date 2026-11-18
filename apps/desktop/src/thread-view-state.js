import {preference} from './settings-preferences.js';
const prefix='suffice-thread-view-v1:';
const empty=()=>({draft:'',panelOpen:false,terminals:{},terminalSequence:0,tabs:[],activeTab:null,panelWidth:null,scrollTop:0,following:true,model:null,files:{wrap:preference('wrap-lines',false),directory:'',file:null,scroll:0,expanded:[],query:'',filterOpen:false,explorerOpen:true,explorerWidth:null,recent:[]},changes:{wrap:preference('wrap-lines',false),diffLayout:preference('diff-layout','Unified').toLowerCase(),file:null,scroll:0,collapsed:[],query:'',filterOpen:false,explorerOpen:true,explorerWidth:null,recent:[]}});
function normalize(value){
 const defaults=empty(),state={...defaults,...value};
 state.files={...defaults.files,...value?.files};state.changes={...defaults.changes,...value?.changes};
 state.draft=typeof state.draft==='string'?state.draft:'';
 state.tabs=[...new Set(Array.isArray(state.tabs)?state.tabs.filter(tab=>typeof tab==='string'&&(['files','changes','rewind'].includes(tab)||/^terminal:[a-f0-9-]{36}$/i.test(tab))):[])];
 state.terminals=value?.terminals&&typeof value.terminals==='object'&&!Array.isArray(value.terminals)?value.terminals:{};
 state.activeTab=state.tabs.includes(state.activeTab)?state.activeTab:state.tabs[0]??null;
 return state;
}
export function createThreadViewStore(storage){
 const cache=new Map(),listeners=new Set();let active=null;
 const key=id=>id??'new';
 function read(id){const name=key(id);if(!cache.has(name)){let value;try{value=JSON.parse(storage.getItem(prefix+name));}catch{}const normalized=normalize(value);if(!preference('restore-terminal',true)){for(const tab of normalized.tabs.filter(tab=>tab.startsWith('terminal:')))if(id)void globalThis.window?.sufficeDesktop?.terminalClose({threadId:id,id:tab}).catch(()=>{});normalized.tabs=normalized.tabs.filter(tab=>!tab.startsWith('terminal:'));normalized.terminals={};if(!normalized.tabs.includes(normalized.activeTab))normalized.activeTab=normalized.tabs[0]??null;}cache.set(name,normalized);}const state=cache.get(name);state.files.wrap=state.changes.wrap=preference('wrap-lines',false);state.changes.diffLayout=preference('diff-layout','Unified').toLowerCase();return state;}
 function write(id,state){state={...state,updatedAt:Date.now()};cache.set(key(id),state);try{storage.setItem(prefix+key(id),JSON.stringify(state));}catch{/* A full or unavailable preference store must not block typing. */}}
 const notify=event=>listeners.forEach(listener=>listener(event));
 return {
  get id(){return active;},get state(){return read(active);},read,
  select(id){active=id??null;notify({type:'select',id:active,state:read(active)});},
  update(patch){const state=normalize({...read(active),...patch});write(active,state);notify({type:'update',id:active,state,changed:Object.keys(patch)});},
  updateFor(id,patch){const state=normalize({...read(id),...patch});write(id,state);notify({type:'update',id,state,changed:Object.keys(patch)});},
  remove(id){cache.delete(key(id));try{storage.removeItem(prefix+key(id));}catch{}notify({type:'remove',id});},
  adopt(id){if(!id||id===active)return;const previous=active;write(id,read(active));try{storage.removeItem(prefix+key(previous));}catch{}cache.delete(key(previous));active=id;notify({type:'adopt',id,state:read(id)});},
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
 };
}
export async function restoreThreadViews(){
 try{const values=await globalThis.window?.sufficeDesktop?.viewStates?.();for(const [key,value] of Object.entries(values||{})){let cached;try{cached=JSON.parse(localStorage.getItem(key));}catch{}const saved=JSON.parse(value);if((saved.updatedAt||0)>=(cached?.updatedAt||0))localStorage.setItem(key,value);}}catch{/* Browser cache remains available if native backup storage is unavailable. */}
}
export const threadViewState=createThreadViewStore({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>{localStorage.setItem(key,value);void Promise.resolve(globalThis.window?.sufficeDesktop?.saveViewState?.({key,value})).catch(()=>{});},removeItem:key=>{localStorage.removeItem(key);void Promise.resolve(globalThis.window?.sufficeDesktop?.saveViewState?.({key,value:null})).catch(()=>{});}});
