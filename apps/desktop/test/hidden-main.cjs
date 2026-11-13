// Runs the real main process with every window hidden, so click scripts never cover the screen or take focus.
const Module=require('node:module');
const electron=require('electron');
if(process.platform==='darwin')electron.app.setActivationPolicy('accessory');
class HiddenWindow extends electron.BrowserWindow{constructor(options={}){super({...options,show:false});}}
const patched=new Proxy(electron,{get:(target,key)=>key==='BrowserWindow'?HiddenWindow:target[key]});
const load=Module._load;
Module._load=function(request,...rest){return request==='electron'?patched:load.call(this,request,...rest);};
require('../electron/main.cjs');
