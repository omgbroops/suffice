const {app,BrowserWindow,ipcMain,dialog,utilityProcess,clipboard,shell}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const workspaceFiles=require('./workspace-files.cjs');
const {prepareAttachments,clipboardFiles}=require('./attachments.cjs');
let background;
let win,worker,project=null,selectedProject=null,sequence=0,running=0;
const requests=new Map();
function request(action,payload){
  if(!worker)return Promise.reject(new Error('Harness process is not available'));
  return new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
}
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
else app.on('second-instance',()=>{
  if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}
});
if(primary)app.whenReady().then(async()=>{
  background=require('./background-tasks.cjs').createBackgroundTasks({fork:(...args)=>utilityProcess.fork(...args),entry:path.join(__dirname,'worker-entry.mjs'),emit:message=>{if(win&&!win.isDestroyed())win.webContents.send('suffice:event',message);}});
  const {projectIdentityMetadata}=await import('./sidebar-metadata.mjs');
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
  handle('open-external',url=>{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!=='github.com')throw new Error('Unsupported link');return shell.openExternal(parsed.href);});
  handle('status',()=>request('status'));
  handle('models',()=>request('models'));
  handle('usage',threadId=>request('usage',{threadId}));
  handle('files',directory=>workspaceFiles.list(project,directory));
  handle('file',name=>workspaceFiles.read(project,name));
  handle('changes',()=>workspaceFiles.changes(project));
  handle('diff',name=>workspaceFiles.diff(project,name));
  handle('clipboard-files',()=>clipboardFiles(clipboard));
  const threadLocations=new Map();
  handle('threads',async()=>{const threads=await request('threads');for(const thread of threads)threadLocations.set(thread.id,thread.cwd);return threads;});
  handle('projects',async()=>Promise.all((await projects.list()).map(async item=>({...item,...await projectIdentityMetadata(item.path)}))));
  handle('select-project',async id=>{const revision=++viewedThreadRevision,item=(await projects.list()).find(p=>p.id===id);if(!item)throw new Error('Project not found');if(revision===viewedThreadRevision){await request('reset');selectedProject=item.path;if(revision===viewedThreadRevision)project=item.path;}return {...item,...await projectIdentityMetadata(item.path),git:await projects.git(item.path)};});
  let viewedThreadRevision=0;
  handle('thread',async id=>{const revision=++viewedThreadRevision;if(threadLocations.has(id))project=threadLocations.get(id);const thread=await request('thread',{id});threadLocations.set(id,thread.cwd);if(revision===viewedThreadRevision)project=thread.cwd;return thread;});
  handle('project',async()=>{
    const result=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Choose a project'});
    if(result.canceled)return null;
    await request('reset');project=selectedProject=result.filePaths[0];return {...await projects.add(project),...await projectIdentityMetadata(project),git:await projects.git(project)};
  });
  async function runTask(payload,inBackground=false){
    if(!project)throw new Error('Choose a project above the composer first');
    if(!payload||typeof payload.prompt!=='string'||payload.prompt.length>1000000||!['off','minimal','low','medium','high','xhigh','max'].includes(payload.effort)||(payload.model!==undefined&&(typeof payload.model!=='string'||typeof payload.provider!=='string')))throw new Error('Invalid task');
    const cwd=project;
    running++;
    try{const attached=await prepareAttachments(app.getPath('userData'),payload.attachments);const task={prompt:payload.prompt+attached.context,images:attached.images,clientId:typeof payload.clientId==='string'?payload.clientId.slice(0,128):null,effort:payload.effort,model:payload.model,provider:payload.provider,threadId:payload.threadId,cwd};return await request('run',task);}finally{running--;}
  }
  handle('run',payload=>runTask(payload));
  handle('run-background',payload=>runTask(payload,true));
  handle('abort',threadId=>request('abort',{threadId}));
  handle('steer',async payload=>{if(!payload||typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('Invalid steering message');const attached=await prepareAttachments(app.getPath('userData'),payload.attachments);return request('steer',{threadId:payload.threadId,prompt:payload.prompt+attached.context,images:attached.images});});
  handle('reset',async()=>{const revision=++viewedThreadRevision;await request('reset');if(revision===viewedThreadRevision)project=selectedProject;});
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
      await request('shutdown').catch(()=>{});
      const until=Date.now()+3000;while(running&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
      if(!running)await request('reset').catch(()=>{});
    })();
    void Promise.race([shutdown,new Promise(resolve=>setTimeout(resolve,3500))]).finally(()=>{worker?.kill();win.destroy();});
  });
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{background?.stop();worker?.kill();});
