import {createRequire} from 'node:module';
import {createNativeServices} from './native-services.mjs';
import {createBrowserSurface} from './browser-surface.mjs';
import {createOutput} from './renderer-transport.mjs';
import Module from 'node:module';
import {EventEmitter} from 'node:events';
import {fork} from 'node:child_process';
import {mkdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {format} from 'node:util';
import {AsyncLocalStorage} from 'node:async_hooks';

const option = name => { const i=process.argv.indexOf(name); return i<0 ? null : process.argv[i+1]; };
const requestedRoot=option('--root'), profile=option('--profile');
if (!requestedRoot || !profile || !process.env.SUFFICE_HOME || !path.isAbsolute(requestedRoot) || !path.isAbsolute(profile) || !path.isAbsolute(process.env.SUFFICE_HOME)) throw new Error('Absolute --root, --profile and SUFFICE_HOME are required');
// CommonJS reports canonical parent filenames (including macOS /private/var).
// Use that same identity when confining the Electron shim to this checkout.
const root=realpathSync(requestedRoot);
mkdirSync(profile,{recursive:true});
// Standalone clients retain the original newline protocol. The Rust host negotiates
// fragmented renderer delivery before starting any trusted app handlers.
const output=createOutput(process.stdout,error=>{throw error;});
let fragmented=false;
const send=message=>{if(fragmented)return output(message);const frame=JSON.stringify(message)+'\n';if(process.stdout.writableLength+Buffer.byteLength(frame)>64*1024*1024)throw new Error('Bridge output backpressure limit reached');return process.stdout.write(frame);};
for (const name of ['log','info','warn','error','debug']) console[name]=(...args)=>process.stderr.write(format(...args)+'\n');
const handlers=new Map(), pending=new Map(), children=new Set();
const invocation=new AsyncLocalStorage();
let started=false, ready=false, quitting=false;
let nativeId=0, windowState={focused:true,minimized:false,maximized:false,visible:true}, window;
const native=(method,...args)=>new Promise((resolve,reject)=>{const id=++nativeId;pending.set(id,{resolve,reject});send({type:'native',id,method,args});});
const windowCall=method=>{const promise=native(method);const calls=invocation.getStore();if(calls)calls.push(promise);promise.catch(()=>{});};
const unsupported=name=>{throw new Error(`${name} is unavailable in this host`);};
const event=()=>({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});
class App extends EventEmitter {
 isPackaged=false;
 whenReady(){return Promise.resolve();}
 requestSingleInstanceLock(){return true;}
 getPath(name){if(name==='userData')return profile;if(name==='appData')return path.dirname(profile);if(name==='home')return require('node:os').homedir();if(name==='temp')return require('node:os').tmpdir();return unsupported(`app.getPath(${name})`);}
 setPath(name,value){if(name!=='userData'||path.resolve(value)!==path.resolve(profile))unsupported('app.setPath');}
 getFileIcon(file,options){return native('app.getFileIcon',file,options).then(data=>({toDataURL:()=>data}));}
 getAppPath(){return root;}
 getVersion(){return require(path.join(root,'apps','desktop','package.json')).version;}
 setAppUserModelId(){}
 setLoginItemSettings(){unsupported('app.setLoginItemSettings');}
 quit(){if(quitting)return;const e=event();this.emit('before-quit',e);if(e.defaultPrevented)return;quitting=true;this.emit('will-quit',event());for(const child of children)child.kill();for(const item of pending.values())item.reject(new Error('Bridge shutting down'));pending.clear();if(started&&!shuttingDown&&process.argv.includes('--wait-for-host')){void native('window.close').then(()=>process.exit(0),()=>process.exit(1));return;}process.exit(0);}
}
const require=createRequire(import.meta.url), app=new App();
class BrowserWindow extends EventEmitter {
 constructor(){super();window=this;this.destroyed=false;const contents=new EventEmitter();contents.mainFrame={};contents.send=(channel,...args)=>send({type:'event',channel,args});contents.setWindowOpenHandler=()=>{};contents.session={clearCache:()=>native('session.clearCache')};this.webContents=contents;}
 isDestroyed(){return this.destroyed;} isFocused(){return !!windowState.focused;} isMinimized(){return !!windowState.minimized;} isMaximized(){return !!windowState.maximized;}
 show(){windowCall('window.show');} hide(){windowCall('window.hide');} focus(){windowCall('window.focus');} restore(){windowCall('window.restore');} minimize(){windowCall('window.minimize');} maximize(){windowCall('window.maximize');} unmaximize(){windowCall('window.unmaximize');}
 close(){const e=event();this.emit('close',e);if(!e.defaultPrevented)this.destroy();}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('closed');app.emit('window-all-closed');}
 setAppDetails(){}
 async loadFile(){setImmediate(()=>{ready=true;send({type:'ready'});});}
}
const ipcMain={handle(name,handler){if(handlers.has(name))throw new Error('Duplicate IPC handler');handlers.set(name,handler);}};
const utilityProcess={fork(entry,args=[],options={}){const child=fork(entry,args,{stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced',windowsHide:true,env:process.env});children.add(child);child.once('exit',()=>children.delete(child));child.postMessage=message=>child.send(message);child.stdout?.on('data',data=>process.stderr.write(data));return child;}};
const dialog={showOpenDialog:(_window,options)=>native('dialog.showOpenDialog',options),showMessageBox:(_window,options)=>native('dialog.showMessageBox',options),showSaveDialog:(_window,options)=>native('dialog.showSaveDialog',options)};
const shell={openExternal:url=>native('shell.openExternal',url),openPath:file=>native('shell.openPath',file),trashItem:file=>native('shell.trashItem',file),showItemInFolder:file=>{void native('shell.showItemInFolder',file).catch(()=>{});},writeShortcutLink:()=>unsupported('shell.writeShortcutLink')};
const clipboard=new Proxy({}, {get:(_target,name)=>()=>unsupported(`clipboard.${String(name)}`)});
class Notification extends EventEmitter {static isSupported(){return false;} show(){unsupported('Notification.show');}}
const nativeImage={createFromPath:()=>unsupported('nativeImage.createFromPath')};
const shim={sufficeOS:createNativeServices(native),sufficeBrowserFactory:createBrowserSurface(native),app,BrowserWindow,ipcMain,utilityProcess,dialog,shell,clipboard,Notification,nativeImage};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='electron' && parent?.filename?.startsWith(path.join(root,'apps','desktop','electron')+path.sep))return shim;return originalLoad.apply(this,arguments);};
let shuttingDown=false;
async function shutdown(){if(shuttingDown)return;shuttingDown=true;await Promise.all([...children].map(child=>new Promise(resolve=>{const id='bridge-shutdown-'+Math.random();const done=message=>{if(message?.id===id){child.off('message',done);clearTimeout(timer);resolve();}};const timer=setTimeout(()=>{child.off('message',done);resolve();},1500);child.on('message',done);try{child.postMessage({id,action:'shutdown'});}catch{clearTimeout(timer);child.off('message',done);resolve();}})));app.quit();}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{let message;try{message=JSON.parse(line);}catch{return;}
 if(message.type==='native-reply'){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);message.ok?item.resolve(message.result):item.reject(new Error(String(message.error||'Native operation failed')));return;}
 if(message.type==='window-close-request'){if(window&&!window.isDestroyed())window.close();else void shutdown();return;}
 if(message.type==='window-state' && message.state && typeof message.state==='object'){windowState={...windowState,...message.state};return;}
 if(message.type==='shutdown'){void shutdown();return;}
 if(message.type==='host-start'){if(!started)fragmented=message.rendererTransport==='fragments-v1';start();return;}
 if(message.type==='invoke-json'){try{message.args=JSON.parse(message.argsJson);message.type='invoke';}catch{send({type:'reply',id:message.id,document:message.document,ok:false,error:'Invalid invocation arguments'});return;}}
 if(message.type!=='invoke'||!Array.isArray(message.args)||typeof message.channel!=='string')return;
 if(!ready){send({type:'reply',id:message.id,document:message.document,ok:false,error:'not ready'});return;}
 const handler=handlers.get(message.channel);const calls=[];invocation.run(calls,()=>Promise.resolve().then(()=>{if(!handler)throw new Error('Unknown IPC channel');return handler({senderFrame:window?.webContents.mainFrame},...message.args);}).then(async result=>{await Promise.all(calls);send({type:'reply',id:message.id,document:message.document,ok:true,result:result??null});},error=>{throw error;}).catch(error=>send({type:'reply',id:message.id,document:message.document,ok:false,error:String(error?.message||error)})));
});
input.on('close',()=>void shutdown());
process.on('uncaughtException',error=>{process.stderr.write(`Bridge failure: ${error.message}\n`);for(const child of children)child.kill();process.exit(1);});
process.on('unhandledRejection',error=>{process.stderr.write(`Bridge failure: ${error?.message||error}\n`);for(const child of children)child.kill();process.exit(1);});
function start(){if(started||shuttingDown)return;started=true;require(path.join(root,'apps','desktop','electron','main.cjs'));}
if(process.argv.includes('--wait-for-host'))send({type:'bootstrap-ready'});else start();
