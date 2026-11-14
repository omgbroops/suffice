const {app,BrowserWindow,ipcMain,dialog,utilityProcess,clipboard,shell,Notification}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomUUID,createHash}=require('node:crypto');
const workspaceFiles=require('./workspace-files.cjs');
const {prepareAttachments,clipboardFiles,removeAttachmentCopy}=require('./attachments.cjs');
let background,terminals;
let win,project=null,selectedProject=null,running=0;
const attachmentGroups=new Map();
let harness;
function request(action,payload){return harness.request(action,payload);}
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
else app.on('second-instance',()=>{
  if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}
});
if(primary)app.whenReady().then(async()=>{
  const {parseOptions}=await import('@suffice/harness');
  const settingsHome=parseOptions([]).home;
  const settings=(await import('./settings-store.mjs')).createSettingsStore(settingsHome);
  background=require('./background-tasks.cjs').createBackgroundTasks({fork:(...args)=>utilityProcess.fork(...args),entry:path.join(__dirname,'worker-entry.mjs'),emit:message=>{if(win&&!win.isDestroyed())win.webContents.send('suffice:event',message);}});
  const {projectIdentityMetadata}=await import('./sidebar-metadata.mjs');
  const projects=require('./projects.cjs').createProjectStore(app.getPath('userData'));if(process.env.SUFFICE_START_PROJECT){const start=await require('node:fs/promises').realpath(process.env.SUFFICE_START_PROJECT);await projects.add(start);project=selectedProject=start;}function openProjectWindow(folder){const profileRoot=process.env.SUFFICE_PROFILE_ROOT||app.getPath('userData');const profile=path.join(profileRoot,'project-windows',createHash('sha256').update(folder).digest('hex').slice(0,16));const child=require('node:child_process').spawn(process.execPath,[...(app.isPackaged?[]:[app.getAppPath()]),'--user-data-dir='+profile],{detached:true,stdio:'ignore',windowsHide:true,env:{...process.env,SUFFICE_START_PROJECT:folder,SUFFICE_PROFILE_ROOT:profileRoot,ELECTRON_RUN_AS_NODE:undefined}});child.unref();}
  harness=require('./worker-client.cjs').createWorkerClient({
   fork:()=>utilityProcess.fork(path.join(__dirname,'worker-entry.mjs'),[],{serviceName:'Suffice harness',stdio:'pipe'}),
   onEvent:message=>{if(message.event==='thread_started'&&attachmentGroups.has(message.clientId))attachmentGroups.set(message.id,attachmentGroups.get(message.clientId));if(message.event==='approval'){void notify('approval','Agent needs approval');void dialog.showMessageBox(win,{type:'question',title:'Allow agent action?',message:message.name,detail:JSON.stringify(message.input,null,2).slice(0,8000),buttons:['Deny','Allow'],defaultId:0,cancelId:0}).then(answer=>request('approval-answer',{threadId:message.threadId,requestId:message.requestId,allow:answer.response===1}));return;}if(message.event==='thread_started'&&threadLocations.has(message.clientId))threadLocations.set(message.id,threadLocations.get(message.clientId));if(win&&!win.isDestroyed())win.webContents.send('suffice:event',message);return;},
   onStderr:data=>process.stderr.write(data)
  });
  win=new BrowserWindow({width:1440,height:900,minWidth:720,minHeight:540,frame:false,backgroundColor:'#0e0e0e',title:'Suffice',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const entry=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault();});
  function handle(name,handler){ipcMain.handle(`suffice:${name}`,(event,...args)=>{if(event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted frame');return handler(...args);});}
  const views=require('./view-state-store.cjs').createViewStateStore(path.join(app.getPath('userData'),'thread-views'));
  handle('view-states',()=>views.load());
  handle('save-view-state',payload=>views.save(payload));
  const providerSettings=(await import('./provider-settings.mjs')).createProviderSettings({emit:event=>{if(!win.isDestroyed())win.webContents.send('suffice:provider-auth',event);},openBrowser:url=>shell.openExternal(url)});
  handle('providers',()=>providerSettings.list());
  handle('provider-login',async payload=>{try{return await providerSettings.login(payload);}catch{throw new Error('Provider connection cancelled or unsuccessful');}});
  handle('provider-answer',payload=>providerSettings.answer(payload));
  handle('provider-cancel',()=>providerSettings.cancel());
  handle('provider-logout',id=>providerSettings.logout(id));
  app.on('will-quit',()=>providerSettings.cancel());
  handle('preferences',()=>settings.stored());
  handle('desktop-preference',async payload=>{if(payload?.id==='startup'&&typeof payload.value==='boolean'){app.setLoginItemSettings({openAtLogin:payload.value,path:process.execPath,args:app.isPackaged?[]:[app.getAppPath()]});}if(payload?.id==='history-retention'&&!['Until deleted','30 days','90 days'].includes(payload.value))throw new Error('Invalid retention');if(payload?.id==='history-retention'&&payload.value!=='Until deleted'){if(running)throw new Error('Finish active agents before changing history retention');const answer=await dialog.showMessageBox(win,{type:'question',message:'Apply history retention?',detail:'Chats older than '+payload.value+' will be moved to the Recycle Bin automatically. The currently viewed chat is kept.',buttons:['Cancel','Apply'],defaultId:0,cancelId:0});if(answer.response!==1)throw new Error('Retention change cancelled');await enforceRetention(parseInt(payload.value));}return settings.set(payload?.id,payload?.value);});
  handle('open-external',url=>{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!=='github.com')throw new Error('Unsupported link');return shell.openExternal(parsed.href);});
  handle('status',()=>request('status'));
  handle('models',options=>request('models',{all:options?.all===true}));
  handle('usage',threadId=>request('usage',{threadId}));
  handle('files',async directory=>{const result=await workspaceFiles.list(project,directory),prefs=await settings.get();let entries=result.entries;if(!prefs['hidden-files'])entries=entries.filter(item=>!item.name.startsWith('.'));if(!prefs.gitignored&&project){try{const exec=require('node:util').promisify(require('node:child_process').execFile);const ignored=(await exec('git',['-C',project,'ls-files','--others','--ignored','--exclude-standard','--directory','-z'],{windowsHide:true,timeout:5000})).stdout.split('\0').filter(Boolean);entries=entries.filter(item=>!ignored.some(name=>item.path===name.replace(/\/$/,'')||item.path.startsWith(name)));}catch{}}if(prefs['file-sort']==='Type')entries.sort((a,b)=>a.kind.localeCompare(b.kind)||path.extname(a.name).localeCompare(path.extname(b.name))||a.name.localeCompare(b.name));if(prefs['file-sort']==='Modified'){const fs=require('node:fs/promises');entries=await Promise.all(entries.map(async item=>({...item,modified:(await fs.stat(path.join(project,item.path)).catch(()=>({mtimeMs:0}))).mtimeMs})));entries.sort((a,b)=>b.modified-a.modified);}return {...result,entries};});
  handle('file',name=>workspaceFiles.read(project,name));
  handle('changes',()=>workspaceFiles.changes(project));
  handle('diff',name=>workspaceFiles.diff(project,name));
  handle('clipboard-files',()=>clipboardFiles(clipboard));
  const threadLocations=new Map();
  terminals=require('./terminals.cjs').createTerminalManager({resolveCwd:async id=>(await settings.get())['working-directory']==='Home directory'?require('node:os').homedir():threadLocations.get(id),resolveShell:async()=>{const prefs=await settings.get();if(process.platform==='win32'&&prefs['terminal-shell']==='PowerShell')return path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');if(prefs['terminal-shell']==='System default')return process.platform==='win32'?process.env.ComSpec:process.env.SHELL||'/bin/bash';return (await import('../../../packages/cli/src/shell.mjs')).nativeShellPath()||process.env.SHELL||'/bin/bash';},emit:event=>{if(win&&!win.isDestroyed())win.webContents.send('suffice:terminal-event',event);}});
  handle('terminal-create',payload=>terminals.create(payload));
  handle('terminal-write',payload=>terminals.write(payload));
  handle('terminal-resize',payload=>terminals.resize(payload));
  handle('terminal-close',payload=>terminals.close(payload));
  handle('threads',async()=>{const threads=await request('threads');for(const thread of threads)threadLocations.set(thread.id,thread.cwd);return threads;});
  handle('projects',async()=>Promise.all((await projects.list()).map(async item=>({...item,...await projectIdentityMetadata(item.path)}))));
  handle('initial-project',async()=>{if(!selectedProject)return null;const item=(await projects.list()).find(item=>item.path===selectedProject);return item?{...item,...await projectIdentityMetadata(item.path),git:await projects.git(item.path)}:null;});
  handle('select-project',async(id,options)=>{const revision=++viewedThreadRevision,item=(await projects.list()).find(p=>p.id===id);if(!item)throw new Error('Project not found');if(!options?.restore&&(await settings.get())['project-open']==='New window'&&selectedProject!==item.path){openProjectWindow(item.path);return {openedNewWindow:true};}if(revision===viewedThreadRevision){await request('reset');selectedProject=item.path;if(revision===viewedThreadRevision)project=item.path;}return {...item,...await projectIdentityMetadata(item.path),git:await projects.git(item.path)};});
  let viewedThreadRevision=0,viewedThreadId=null;
  handle('thread',async id=>{viewedThreadId=id;const revision=++viewedThreadRevision;if(threadLocations.has(id))project=threadLocations.get(id);const thread=await request('thread',{id});threadLocations.set(id,thread.cwd);if(revision===viewedThreadRevision)project=thread.cwd;return thread;});
  handle('project',async()=>{
    const result=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Choose a project'});
    if(result.canceled)return null;
    if((await settings.get())['project-open']==='New window'){await projects.add(result.filePaths[0]);openProjectWindow(result.filePaths[0]);return {openedNewWindow:true};}
    await request('reset');project=selectedProject=result.filePaths[0];return {...await projects.add(project),...await projectIdentityMetadata(project),git:await projects.git(project)};
  });
  async function runTask(payload,inBackground=false){
    if(!project)throw new Error('Choose a project above the composer first');
    if(!payload||typeof payload.prompt!=='string'||payload.prompt.length>1000000||!['off','minimal','low','medium','high','xhigh','max'].includes(payload.effort)||(payload.model!==undefined&&(typeof payload.model!=='string'||typeof payload.provider!=='string')))throw new Error('Invalid task');
    const prefs=await settings.get();if((inBackground||running>0)&&!prefs['background-agents'])throw new Error('Background agents are disabled in settings');let cwd=project;if(!payload.threadId&&prefs['worktree-mode']!=='Current checkout'){let create=prefs['worktree-mode']==='New worktree';if(prefs['worktree-mode']==='Ask each time'){const answer=await dialog.showMessageBox(win,{message:'Where should this session work?',buttons:['Current checkout','New worktree','Cancel'],cancelId:2});if(answer.response===2)throw new Error('Session cancelled');create=answer.response===1;}if(create){const target=path.join(prefs['worktree-location']==='Custom location'&&prefs['worktree-path']?prefs['worktree-path']:path.join(settingsHome,'worktrees'),randomUUID());await require('node:fs/promises').mkdir(path.dirname(target),{recursive:true});await require('node:util').promisify(require('node:child_process').execFile)('git',['-C',project,'worktree','add','-b','suffice/session-'+randomUUID().slice(0,8),target],{windowsHide:true,timeout:30000});cwd=target;}}
    if(typeof payload.clientId==='string')threadLocations.set(payload.clientId,cwd);
    running++;const attachmentGroup=[];attachmentGroups.set(payload.threadId||payload.clientId,attachmentGroup);
    try{const attached=await prepareAttachments(app.getPath('userData'),payload.attachments);if(attached.directory)attachmentGroup.push(attached.directory);const task={prompt:payload.prompt+attached.context,images:attached.images,clientId:typeof payload.clientId==='string'?payload.clientId.slice(0,128):null,effort:payload.effort,model:payload.model,provider:payload.provider,threadId:payload.threadId,cwd,desktopSettings:prefs};try{const result=await request('run',task);await notify('finished','Agent finished');return result;}catch(error){await notify('failed','Agent encountered an error');if(prefs.diagnostics){await require('node:fs/promises').appendFile(path.join(settingsHome,'desktop-diagnostics.jsonl'),JSON.stringify({at:new Date().toISOString(),type:'task_error',name:error.name})+'\n',{mode:0o600});}throw error;}}finally{running--;for(const [key,group] of attachmentGroups)if(group===attachmentGroup)attachmentGroups.delete(key);if(!prefs['save-attachments'])for(const directory of attachmentGroup)await removeAttachmentCopy(app.getPath('userData'),directory).catch(()=>{});}
  }
  async function notify(kind,title){const prefs=await settings.get();if(!prefs[kind]||(prefs.unfocused&&win.isFocused())||!Notification.isSupported())return;const notification=new Notification({title:'Suffice',body:title,silent:true});notification.on('click',()=>{win.show();win.focus();});notification.show();win.webContents.send('suffice:notification',{sound:prefs.sound,play:!!prefs['notification-sound']});}
  handle('settings-action',async action=>{if(action==='export'){const chosen=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],title:'Export conversations'});if(chosen.canceled)return null;return (await import('./settings-data-actions.mjs')).exportSessions(settingsHome,chosen.filePaths[0]);}if(action==='clear-cache'){await win.webContents.session.clearCache();win.webContents.send('suffice:clear-cache');return true;}if(action==='worktree-location'){const chosen=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],title:'Worktree location'});if(chosen.canceled)return null;await settings.set('worktree-path',chosen.filePaths[0]);return chosen.filePaths[0];}throw new Error('Unknown settings action');});
  handle('run',payload=>runTask(payload));
  handle('run-background',payload=>runTask(payload,true));
  handle('abort',threadId=>request('abort',{threadId}));
  handle('steer',async payload=>{if(!payload||typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('Invalid steering message');const attached=await prepareAttachments(app.getPath('userData'),payload.attachments);if(attached.directory)attachmentGroups.get(payload.threadId)?.push(attached.directory);return request('steer',{threadId:payload.threadId,prompt:payload.prompt+attached.context,images:attached.images});});
  handle('reset',async()=>{viewedThreadId=null;const revision=++viewedThreadRevision;await request('reset');if(revision===viewedThreadRevision)project=selectedProject;});
  handle('window',action=>{
    if(action==='minimize')win.minimize();
    else if(action==='maximize'){win.isMaximized()?win.unmaximize():win.maximize();}
    else if(action==='close')win.close();
    else throw new Error('Unknown window control');
  });
  async function enforceRetention(days){if(running||![30,90].includes(days))return;const actions=await import('./settings-data-actions.mjs'),files=await actions.sessionFiles(settingsHome),active=new Set(files.filter(file=>createHash('sha256').update(process.platform==='win32'?path.resolve(file.path).toLowerCase():path.resolve(file.path)).digest('hex').slice(0,32)===viewedThreadId).map(file=>file.path));const count=await actions.expireSessions(settingsHome,days,{trash:file=>shell.trashItem(file),active});if(count&&!win.isDestroyed())win.webContents.send('suffice:event',{event:'history_changed'});}
  const retentionTimer=setInterval(()=>void settings.get().then(prefs=>enforceRetention(parseInt(prefs['history-retention']))).catch(()=>{}),3600000);retentionTimer.unref();
  await win.loadFile(path.join(__dirname,'../dist/index.html'));void settings.get().then(prefs=>enforceRetention(parseInt(prefs['history-retention']))).catch(()=>{});
  let closing=false;app.on('before-quit',()=>{closing=true;});
  win.on('close',event=>{
    if(closing)return;event.preventDefault();void settings.get().then(prefs=>{if(prefs.tray){win.hide();return;}closing=true;shutdownWindow();});
  });
  function shutdownWindow(){
    const shutdown=(async()=>{
      background.stop();terminals?.dispose();
      await request('shutdown').catch(()=>{});
      const until=Date.now()+3000;while(running&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
      if(!running)await request('reset').catch(()=>{});
    })();
    void Promise.race([shutdown,new Promise(resolve=>setTimeout(resolve,3500))]).finally(()=>{harness?.stop();win.destroy();});
  }
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{terminals?.dispose();background?.stop();harness?.stop();});
