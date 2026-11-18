// Test-only wrapper main for the ask bar: like voice-hidden-main.cjs, plus a fake globalShortcut so no real OS-wide shortcut is registered.
// globalThis.shortcuts maps accelerator -> callback; a test fires one to press the shortcut.
const Module=require('node:module');
const path=require('node:path');
const electron=require('electron');
if(process.platform==='darwin')electron.app.setActivationPolicy('accessory');
const noop=()=>{};
// A construct trap (not a subclass) keeps instances visible to BrowserWindow.getAllWindows().
const HiddenWindow=new Proxy(electron.BrowserWindow,{construct(Target,[options={}]){
 const win=new Target({...options,show:false,alwaysOnTop:false,skipTaskbar:true});
 for(const name of ['show','showInactive','focus','moveTop','restore','flashFrame'])win[name]=noop;
 win.isFocused=()=>true;
 return win;
}});
const dock=electron.app.dock?{hide:noop,show:async()=>{},setIcon:noop,setBadge:noop,bounce:()=>0,cancelBounce:noop,setMenu:noop}:undefined;
const app=new Proxy(electron.app,{get:(target,key)=>key==='dock'?dock:key==='setLoginItemSettings'||key==='setBadgeCount'?noop:typeof target[key]==='function'?target[key].bind(target):target[key]});
electron.app.dock?.hide();
globalThis.shortcuts=new Map();
const globalShortcut={register:(key,callback)=>{globalThis.shortcuts.set(key,callback);return true;},unregister:key=>{globalThis.shortcuts.delete(key);},unregisterAll:()=>globalThis.shortcuts.clear(),isRegistered:key=>globalThis.shortcuts.has(key)};
const patched=new Proxy(electron,{get:(target,key)=>({BrowserWindow:HiddenWindow,app,globalShortcut})[key]??target[key]});
const load=Module._load;
Module._load=function(request,...rest){return request==='electron'?patched:load.call(this,request,...rest);};
process.env.SUFFICE_TEST_HIDE_WINDOW='1';
require(path.join(__dirname,'../electron/main.cjs'));
