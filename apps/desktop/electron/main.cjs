const {app,BrowserWindow,ipcMain,dialog,utilityProcess,clipboard,shell,session}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const workspaceFiles=require('./workspace-files.cjs');
const {createGithub,safeUrl}=require('./github.cjs');
const {prepareAttachments,clipboardFiles}=require('./attachments.cjs');
const {createIpc}=require('./ipc.cjs');
const {createBusy}=require('./busy.cjs');
const {createHarness}=require('./harness.cjs');
const {createKnownPaths}=require('./known-paths.cjs');
const {sufficeHome}=require('./paths.cjs');

const DIST=path.join(__dirname,'../dist/index.html');
const EFFORTS=['off','minimal','low','medium','high','xhigh','max'];
const ghKind=kind=>{if(kind!=='pr'&&kind!=='issue')throw new Error('Bad kind');return kind;};

if(!app.requestSingleInstanceLock())app.quit();
else{
 app.whenReady().then(start);
 app.on('window-all-closed',()=>app.quit());
}

async function start(){
 let win=null,project=null,selectedProject=null,closing=false;
 const entry=pathToFileURL(DIST).href;
 const entryPath=new URL(entry).pathname;
 const emit=message=>{if(win&&!win.isDestroyed())win.webContents.send('suffice:event',message);};
 const busy=createBusy();
 const isBusy=()=>busy.count()>0;
 const threadCwds=new Set();

 const background=require('./background-tasks.cjs').createBackgroundTasks({fork:(...args)=>utilityProcess.fork(...args),entry:path.join(__dirname,'worker-entry.mjs'),emit});
 const harness=createHarness({fork:(...args)=>utilityProcess.fork(...args),entry:path.join(__dirname,'worker-entry.mjs'),emit,openUrl:url=>shell.openExternal(url)});
 const request=harness.request;
 const projects=require('./projects.cjs').createProjectStore(app.getPath('userData'));
 const known=createKnownPaths({projects,threadCwds:()=>threadCwds});
 const github=createGithub();

 win=new BrowserWindow({width:1440,height:900,minWidth:720,minHeight:540,frame:false,backgroundColor:'#0e0e0e',title:'Suffice',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const isOwnPage=url=>{try{const u=new URL(url);return u.protocol==='file:'&&u.pathname===entryPath;}catch{return false;}};
 // Only the microphone, and only for the app's own page.
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='media'&&isOwnPage(details?.requestingUrl||contents.getURL())));
 session.defaultSession.setPermissionCheckHandler((contents,permission,origin)=>permission==='media'&&isOwnPage(origin||contents?.getURL()||''));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 const guard=event=>{if(event.url!==entry)event.preventDefault();};
 win.webContents.on('will-navigate',guard);
 win.webContents.on('will-redirect',guard);
 win.webContents.on('will-frame-navigate',guard);

 const {handle}=createIpc({ipcMain,getWindow:()=>win,entryUrl:entry});

 // status and account
 handle('status',()=>request('status'));
 handle('models',()=>request('models'));
 handle('usage',()=>request('usage'));
 handle('login',()=>request('login').finally(()=>harness.clearLoginUrl()));
 handle('logout',()=>{if(isBusy())throw new Error('Stop the current task first');return request('logout');});
 handle('login-input',text=>{if(typeof text!=='string'||text.length>10000)throw new Error('Invalid sign-in response');return request('login-input',{text});});
 handle('login-cancel',()=>request('login-cancel'));
 handle('login-open',()=>{const url=harness.loginUrl();if(url)void shell.openExternal(url);});

 // workspace files of the selected project
 handle('files',directory=>workspaceFiles.list(project,directory));
 handle('file',name=>workspaceFiles.read(project,name));
 handle('changes',()=>workspaceFiles.changes(project));
 handle('diff',name=>workspaceFiles.diff(project,name));
 handle('clipboard-files',()=>clipboardFiles(clipboard));

 // github and git views of the selected project
 handle('git-info',async()=>({...await github.info(project),login:await github.user()}));
 handle('issues',()=>github.issues(project));
 handle('prs',()=>github.prs(project));
 handle('github-list',o=>{
  const kind=ghKind(o?.kind),states=kind==='pr'?['open','closed','merged']:['open','closed'];
  if(!states.includes(o.state))throw new Error('Bad state');
  return github.listFull(project,{kind,state:o.state,limit:Math.min(Math.max(Math.trunc(o.limit)||50,1),100)});
 });
 handle('github-detail',o=>{
  const kind=ghKind(o?.kind);
  if(!Number.isInteger(o.number)||o.number<1)throw new Error('Bad number');
  return github.detail(project,{kind,number:o.number});
 });
 handle('branch-prs',root=>known.isKnown(root)?github.branchPrs(root):{});
 handle('git-branches',()=>github.gitBranches(project));
 handle('git-log',()=>github.gitLog(project));
 handle('open-github',url=>{if(!safeUrl(url))throw new Error('Only github.com links open here');return shell.openExternal(url);});

 // projects and threads
 handle('projects',()=>projects.list());
 handle('select-project',async id=>{
  if(isBusy())throw new Error('Stop the current task first');
  const item=(await projects.list()).find(p=>p.id===id);
  if(!item)throw new Error('Project not found');
  await request('reset');
  project=selectedProject=item.path;
  return {...item,git:await projects.git(project)};
 });
 handle('threads',async()=>{const list=await request('threads');for(const t of list)if(t?.cwd)threadCwds.add(t.cwd);return list;});
 handle('thread',async id=>{
  if(isBusy())throw new Error('Stop the current task before switching threads');
  const thread=await request('thread',{id});
  project=thread.cwd;
  if(thread.cwd)threadCwds.add(thread.cwd);
  return thread;
 });
 handle('project',async()=>{
  if(isBusy())throw new Error('Stop the current task before changing projects');
  const result=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Choose a project'});
  if(result.canceled)return null;
  await request('reset');
  project=selectedProject=result.filePaths[0];
  return {...await projects.add(project),git:await projects.git(project)};
 });
 handle('reset',async()=>{await request('reset');project=selectedProject;});

 // composer: worktrees and dictation
 require('./composer-ipc.cjs').register({handle,projects,request,getProject:()=>project,setProject:p=>{project=selectedProject=p;},isBusy});

 // running tasks
 async function runTask(payload,inBackground=false,cwdOverride=null){
  if(!inBackground&&busy.count('foreground'))throw new Error('A task is already running');
  if(!project&&!cwdOverride)throw new Error('Choose a project above the composer first');
  if(!payload||typeof payload.prompt!=='string'||payload.prompt.length>1000000||!EFFORTS.includes(payload.effort)||(payload.model!==undefined&&(typeof payload.model!=='string'||typeof payload.provider!=='string')))throw new Error('Invalid task');
  const cwd=cwdOverride||project;
  const end=busy.begin(inBackground?'background':'foreground');
  try{
   const attached=await prepareAttachments(app.getPath('userData'),payload.attachments);
   const task={prompt:payload.prompt+attached.context,images:attached.images,clientId:typeof payload.clientId==='string'?payload.clientId.slice(0,128):null,effort:payload.effort,model:payload.model,provider:payload.provider,cwd};
   return await (inBackground?background.run(task):request('run',task));
  }finally{end();}
 }
 handle('run',payload=>runTask(payload));
 handle('run-background',payload=>runTask(payload,true));
 handle('abort',()=>request('abort'));

 // automations
 const automations=require('./automations.cjs').createAutomations({
  file:path.join(sufficeHome(),'automations.json'),
  busy:isBusy,
  isRegistered:known.isProject,
  run:item=>runTask({prompt:item.prompt,effort:item.effort,model:item.model,provider:item.provider},true,item.projectPath),
 });
 handle('automations',()=>automations.list());
 handle('automation-save',input=>automations.save(input));
 handle('automation-delete',id=>automations.remove(id));
 handle('automation-toggle',(id,enabled)=>automations.toggle(id,enabled));
 handle('automation-run-now',id=>automations.runNow(id));
 const automationTimer=setInterval(()=>{automations.tick().catch(()=>{});},30000);
 app.on('will-quit',()=>{clearInterval(automationTimer);background.stop();harness.setClosing();harness.kill();});

 handle('window',action=>{
  if(action==='minimize')win.minimize();
  else if(action==='maximize'){win.isMaximized()?win.unmaximize():win.maximize();}
  else if(action==='close')win.close();
  else throw new Error('Unknown window control');
 });

 await win.loadFile(DIST);

 win.on('close',event=>{
  if(closing)return;
  event.preventDefault();closing=true;harness.setClosing();
  const shutdown=(async()=>{
   background.stop();
   await request('login-cancel').catch(()=>{});
   await request('abort').catch(()=>{});
   const until=Date.now()+3000;
   while(busy.count('foreground')&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
   if(!busy.count('foreground'))await request('reset').catch(()=>{});
  })();
  void Promise.race([shutdown,new Promise(resolve=>setTimeout(resolve,3500))]).finally(()=>{harness.kill();win.destroy();});
 });
}
