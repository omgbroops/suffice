// Runs the real main process with every window hidden, so click scripts never cover the screen or take focus.
const Module=require('node:module');
const electron=require('electron');
if(process.platform==='darwin')electron.app.setActivationPolicy('accessory');
// A construct trap, not a subclass: subclass instances drop out of BrowserWindow.getAllWindows().
const HiddenWindow=new Proxy(electron.BrowserWindow,{construct(Target,[options={}]){
  const win=new Target({...options,show:false});
  // maximize() would show a hidden window on screen; track the state instead (the IPC path is still exercised)
  let maximized=false;
  win.maximize=()=>{maximized=true;win.emit('maximize');};
  win.unmaximize=()=>{if(maximized){maximized=false;win.emit('unmaximize');}};
  win.isMaximized=()=>maximized;
  return win;
}});
// SUFFICE_FAKE_HARNESS=1 swaps the harness process for the fake one in this folder (no provider, no network).
const fake=process.env.SUFFICE_FAKE_HARNESS==='1'?require('node:path').join(__dirname,'fake-worker-entry.mjs'):null;
const utilityProcess={fork:(entry,...rest)=>electron.utilityProcess.fork(fake&&entry.endsWith('worker-entry.mjs')?fake:entry,...rest)};
// SUFFICE_TEST_SLOW_IPC=channel=ms delays one IPC handler, to pin down startup ordering races.
const [slowChannel,slowMs]=(process.env.SUFFICE_TEST_SLOW_IPC||'').split('=');
const ipcMain=new Proxy(electron.ipcMain,{get:(target,key)=>key==='handle'?(channel,fn)=>target.handle(channel,channel===slowChannel?async(...args)=>{await new Promise(r=>setTimeout(r,Number(slowMs)));return fn(...args);}:fn):typeof target[key]==='function'?target[key].bind(target):target[key]});
const patched=new Proxy(electron,{get:(target,key)=>key==='BrowserWindow'?HiddenWindow:key==='utilityProcess'?utilityProcess:key==='ipcMain'?ipcMain:target[key]});
const load=Module._load;
Module._load=function(request,...rest){return request==='electron'?patched:load.call(this,request,...rest);};
require('../electron/main.cjs');
