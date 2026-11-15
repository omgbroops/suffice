const key='suffice-sidebar-preferences-v1';
const defaults={group:'none',sort:'activity',filter:'all',compact:false,branch:true,provider:true,diff:true};
let state={...defaults};
try{const saved=JSON.parse(localStorage.getItem(key)||'{}');for(const name of Object.keys(defaults)){if(typeof saved[name]===typeof defaults[name])state[name]=saved[name];}}catch{}
const listeners=new Set();
export const sidebarPreferences={
 get:()=>({...state}),
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
 choose(value){const [name,option]=value.split('=');if(name==='reset')state={...defaults};else if(Object.hasOwn(defaults,name))state[name]=typeof defaults[name]==='boolean'?!state[name]:option;try{localStorage.setItem(key,JSON.stringify(state));}catch{}for(const fn of listeners)fn({...state});},
 items(){const choice=(name,label,value)=>({label,selected:state[name]===value,action:`sidebar:${name}=${value}`});const toggle=(name,label)=>({label,selected:state[name],action:`sidebar:${name}=toggle`});return [
 {label:'Group by',children:()=>[choice('group','None','none'),choice('group','Project','project')]},
 {label:'Sort by',children:()=>[choice('sort','Last activity','activity'),choice('sort','Name','name')]},
 {label:'Filter',children:()=>[choice('filter','All threads','all'),choice('filter','Running','working'),choice('filter','Needs attention','attention'),choice('filter','Unread','unread'),choice('filter','With drafts','draft'),choice('filter','Archived','archived')]},
 {label:'Show',children:()=>[toggle('branch','Branch'),toggle('provider','Model provider'),toggle('diff','Chat changes')]},
 {...toggle('compact','Compact'),separator:true},
 {label:'Reset sidebar',action:'sidebar:reset',separator:true}];}
};
