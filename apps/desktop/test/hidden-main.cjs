// Runs the real main process with every window hidden, so click scripts never cover the screen or take focus.
const Module=require('node:module');
const electron=require('electron');
if(process.platform==='darwin')electron.app.setActivationPolicy('accessory');
class HiddenWindow extends electron.BrowserWindow{constructor(options={}){super({...options,show:false});}}
// SUFFICE_FAKE_HARNESS=1 swaps the harness process for the fake one in this folder (no provider, no network).
const fake=process.env.SUFFICE_FAKE_HARNESS==='1'?require('node:path').join(__dirname,'fake-worker-entry.mjs'):null;
const utilityProcess={fork:(entry,...rest)=>electron.utilityProcess.fork(fake&&entry.endsWith('worker-entry.mjs')?fake:entry,...rest)};
const patched=new Proxy(electron,{get:(target,key)=>key==='BrowserWindow'?HiddenWindow:key==='utilityProcess'?utilityProcess:target[key]});
const load=Module._load;
Module._load=function(request,...rest){return request==='electron'?patched:load.call(this,request,...rest);};
require('../electron/main.cjs');
