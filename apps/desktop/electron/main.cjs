const {app,BrowserWindow,ipcMain,dialog,utilityProcess,clipboard}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const workspaceFiles=require('./workspace-files.cjs');
const {prepareAttachments,clipboardFiles}=require('./attachments.cjs');
let background;
let win,worker,project=null,selectedProject=null,sequence=0,running=false;
const requests=new Map();
function request(action,payload){
  if(!worker)return Promise.reject(new Error('Harness process is not available'));
  return new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
}
app.whenReady().then(async()=>{
  background=require('./background-tasks.cjs').createBackgroundTasks({fork:(...args)=>utilityProcess.fork(...args),entry:path.join(__dirname,'worker-entry.mjs'),emit:message=>{if(win&&!win.isDestroyed())win.webContents.send('suffice:event',message);}});
  const projects=require('./projects.cjs').createProjectStore(app.getPath('userData'));
  worker=utilityProcess.fork(path.join(__dirname,'worker-entry.mjs'),[],{serviceName:'Suffice harness',stdio:'pipe'});
  worker.on('message',message=>{
    if(message.event){if(win&&!win.isDestroyed())win.webContents.send('suffice:event',message);return;}
    const pending=requests.get(message.id);if(!pending)return;requests.delete(message.id);
    message.ok?pending.resolve(message.result):pending.reject(new Error(message.error));
  });
  worker.on('exit',()=>{worker=null;for(const pending of requests.values())pending.reject(new Error('Harness process exited'));requests.clear();});
  worker.stderr?.on('data',data=>process.stderr.write(data));
  win=new BrowserWindow({width:1440,height:900,minWidth:720,minHeight:540,frame:false,backgroundColor:'#0e0e0e',title:'Suffice',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const entry=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault();});
  function handle(name,handler){ipcMain.handle(`suffice:${name}`,(event,...args)=>{if(event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted frame');return handler(...args);});}
  handle('status',()=>request('status'));
  handle('models',()=>request('models'));
  handle('usage',()=>request('usage'));
  handle('files',directory=>workspaceFiles.list(project,directory));
  handle('file',name=>workspaceFiles.read(project,name));
  handle('changes',()=>workspaceFiles.changes(project));
  handle('diff',name=>workspaceFiles.diff(project,name));
  handle('clipboard-files',()=>clipboardFiles(clipboard));
  handle('threads',()=>request('threads'));
  handle('projects',()=>projects.list());
  handle('select-project',async id=>{if(running)throw new Error('Stop the current task first');const item=(await projects.list()).find(p=>p.id===id);if(!item)throw new Error('Project not found');await request('reset');project=selectedProject=item.path;return {...item,git:await projects.git(project)};});
  handle('thread',async id=>{if(running)throw new Error('Stop the current task before switching threads');const thread=await request('thread',{id});project=thread.cwd;return thread;});
  handle('project',async()=>{
    if(running)throw new Error('Stop the current task before changing projects');
    const result=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Choose a project'});
    if(result.canceled)return null;
    await request('reset');project=selectedProject=result.filePaths[0];return {...await projects.add(project),git:await projects.git(project)};
  });
  async function runTask(payload,inBackground=false){
    if(running&&!inBackground)throw new Error('A task is already running');
    if(!project)throw new Error('Choose a project above the composer first');
    if(!payload||typeof payload.prompt!=='string'||payload.prompt.length>1000000||!['off','minimal','low','medium','high','xhigh','max'].includes(payload.effort)||(payload.model!==undefined&&(typeof payload.model!=='string'||typeof payload.provider!=='string')))throw new Error('Invalid task');
    const cwd=project;
    if(!inBackground)running=true;
    try{const attached=await prepareAttachments(app.getPath('userData'),payload.attachments);const task={prompt:payload.prompt+attached.context,images:attached.images,clientId:typeof payload.clientId==='string'?payload.clientId.slice(0,128):null,effort:payload.effort,model:payload.model,provider:payload.provider,cwd};return await (inBackground?background.run(task):request('run',task));}finally{if(!inBackground)running=false;}
  }
  handle('run',payload=>runTask(payload));
  handle('run-background',payload=>runTask(payload,true));
  handle('abort',()=>request('abort'));
  handle('reset',async()=>{await request('reset');project=selectedProject;});
  handle('window',action=>{
    if(action==='minimize')win.minimize();
    else if(action==='maximize'){win.isMaximized()?win.unmaximize():win.maximize();}
    else if(action==='close')win.close();
    else throw new Error('Unknown window control');
  });
  await win.loadFile(path.join(__dirname,'../dist/index.html'));
  let closing=false;
  win.on('close',event=>{
    if(closing)return;event.preventDefault();closing=true;
    const shutdown=(async()=>{
      background.stop();
      await request('abort').catch(()=>{});
      const until=Date.now()+3000;while(running&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
      if(!running)await request('reset').catch(()=>{});
    })();
    void Promise.race([shutdown,new Promise(resolve=>setTimeout(resolve,3500))]).finally(()=>{worker?.kill();win.destroy();});
  });
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{background?.stop();worker?.kill();});
