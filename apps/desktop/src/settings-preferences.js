import {setTheme} from './theme.js';
import {settingsSections} from './settings-data.js';
export const supportedSettings=new Set(settingsSections.flatMap(section=>section.groups.flatMap(group=>group.rows)).filter(row=>row.id&&['toggle','select','segment','themes','palette','action','range'].includes(row.type)).map(row=>row.id));
supportedSettings.add('sidebar-collapsed');supportedSettings.add('file-open-app');supportedSettings.add('disabled-models');supportedSettings.add('approval-mode');
let saved={};try{saved=JSON.parse(localStorage.getItem('suffice-settings-v1'))||{};}catch{}
export function preference(id,fallback){return saved[id]??fallback;}
export async function initializePreferences(){const remote=await globalThis.window?.sufficeDesktop?.preferences?.();if(remote){for(const [id,value] of Object.entries(saved))if(supportedSettings.has(id)&&!Object.hasOwn(remote,id))await window.sufficeDesktop.desktopPreference({id,value});saved={...saved,...remote};localStorage.setItem('suffice-settings-v1',JSON.stringify(saved));applyPreferences();}}
export async function savePreference(id,value){
 if(!supportedSettings.has(id))throw new Error('This setting is not supported yet');
 await window.sufficeDesktop?.desktopPreference({id,value});
 saved[id]=value;localStorage.setItem('suffice-settings-v1',JSON.stringify(saved));applyPreferences();document.dispatchEvent(new CustomEvent('suffice-preference',{detail:{id,value}}));
}
const system=globalThis.matchMedia?.('(prefers-color-scheme:light)')??{matches:false,addEventListener(){}};
let osDark=null;// null = no bridge value yet, fall back to matchMedia
export function previewBackgroundDimming(value){const dim=Math.min(80,Math.max(0,Number(value)||0))/100;document.documentElement.style.setProperty('--background-dim',String(dim));}
export function previewSurfaceOpacity(value){document.documentElement.style.setProperty('--surface-opacity',Math.min(100,Math.max(0,Number(value)||0))+'%');}
export function applyPreferences(){
 if(typeof document==='undefined')return;
 previewBackgroundDimming(preference('background-dimming',35));previewSurfaceOpacity(preference('surface-opacity',72));
 const root=document.documentElement;if(Object.hasOwn(saved,'sidebar-collapsed')&&!root.classList.contains('settings-open'))document.body.classList.toggle('sidebar-collapsed',saved['sidebar-collapsed']);root.lang=preference('language','System')==='English'?'en':(navigator.language.startsWith('en')?navigator.language:'en');
 if(saved.mode)setTheme(saved.mode==='System'?((osDark===null?system.matches:!osDark)?'light':'dark'):saved.mode.toLowerCase());
 if(saved.background)localStorage.setItem('suffice-background',saved.background);
 if(saved.accent)root.style.setProperty('--blue',saved.accent);
 root.classList.toggle('hide-chat-background',saved['chat-background']===false);root.classList.toggle('hide-settings-background',saved['settings-background']===false);
 root.classList.toggle('reduce-motion',!!saved['reduced-motion']);root.classList.toggle('solid-surfaces',saved.glass===false);root.classList.toggle('private-details',!!saved['private-labels']);root.classList.toggle('hide-context-ring',saved['context-ring']===false);
 const fonts={Inter:'"Inter Variable",sans-serif',Geist:'Geist,sans-serif',System:'system-ui', 'JetBrains Mono':'"JetBrains Mono",monospace','Geist Mono':'"Geist Mono",monospace','System mono':'monospace'};
 if(saved['interface-font'])root.style.setProperty('--font-sans',fonts[saved['interface-font']]);
 if(saved['code-font'])root.style.setProperty('--font-mono',fonts[saved['code-font']]);
 if(saved['text-size'])root.style.setProperty('--ui-text',saved['text-size']);
 root.classList.toggle('hide-file-icons',saved['file-icons']===false);root.dataset.settingsDensity=saved.density||'Comfortable';root.dataset.editorLines=String(saved['line-numbers']!==false);root.style.setProperty('--editor-tab-size',parseInt(saved['tab-size'])||2);
}
system.addEventListener('change',()=>{if(saved.mode==='System')applyPreferences();});
const bridge=globalThis.window?.sufficeDesktop;// macOS scheme comes from nativeTheme; the hidden window's matchMedia can disagree
const setOsDark=dark=>{osDark=!!dark;if(saved.mode==='System')applyPreferences();};
bridge?.onOsTheme?.(setOsDark);bridge?.osDark?.().then(setOsDark,()=>{});
applyPreferences();
