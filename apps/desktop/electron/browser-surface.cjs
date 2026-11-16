const {randomUUID}=require('node:crypto');

function allowed(raw) {
  if(typeof raw!=='string'||raw.length>8192)return false;
  if(raw==='about:blank')return true;
  try {
    const uri=new URL(raw);
    return ['https:','http:'].includes(uri.protocol)&&!uri.username&&!uri.password&&
      uri.hostname.replace(/\.$/,'').toLowerCase()!=='suffice.localhost';
  } catch {return false;}
}
function rectangle(value,width,height){
  if(!value||!['x','y','width','height'].every(k=>Number.isFinite(value[k])))throw new Error('Invalid browser bounds');
  const x=Math.max(0,Math.min(width,Math.round(value.x))),y=Math.max(0,Math.min(height,Math.round(value.y)));
  return {x,y,width:Math.max(0,Math.min(width-x,Math.round(value.width))),height:Math.max(0,Math.min(height-y,Math.round(value.height)))};
}
function downloadName(name) {
  const {win32,posix}=require('node:path');
  const clean=win32.basename(posix.basename(String(name))).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200);
  return clean && clean!=='.' && clean!=='..' ? clean : 'download';
}
function origin(raw) {
  try { return new URL(raw).origin; } catch { return ''; }
}
function downloadable(url) {
  return (allowed(url)&&url!=='about:blank') || (url.startsWith('blob:')&&allowed(origin(url)));
}
function createElectronBrowserSurface({win}){
  const {WebContentsView,session,dialog,app}=require('electron');
  const pages=[];
  let token,error='',ephemeral,stateTimer,bounds,visible=false,prompting=false;
  const active=()=>pages.at(-1);
  const current=()=>active()?.webContents;
  function state(){
    const wc=current();
    return {token,url:wc?.getURL()||'about:blank',title:(wc?.getTitle()||'').slice(0,256),loading:!!wc?.isLoading(),canBack:!!wc?.navigationHistory.canGoBack(),canForward:!!wc?.navigationHistory.canGoForward(),popupDepth:Math.max(0,pages.length-1),error};
  }
  function emit(){
    if(stateTimer||!current())return;
    stateTimer=setTimeout(()=>{stateTimer=null;if(current()&&!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('suffice:browser-state',state());},24);
  }
  function report(message){error=message;emit();}
  function place(){
    for(const view of pages){
      const show=visible&&view===active();
      if(show&&bounds)view.setBounds(bounds);
      view.setVisible(show);
    }
  }
  function removeFrom(index){
    if(index<0)return;
    const removed=pages.splice(index);
    for(const view of removed.reverse()){
      if(!win.isDestroyed()&&win.contentView.children.includes(view))win.contentView.removeChildView(view);
      if(view.webContents&&!view.webContents.isDestroyed())view.webContents.close();
    }
    place();emit();
  }
  function dispose(){
    clearTimeout(stateTimer);stateTimer=null;visible=false;bounds=null;token=null;error='';
    removeFrom(0);
  }
  const foreground=wc=>wc===current()&&visible&&!win.isDestroyed()&&!wc.isDestroyed();
  function prompt(wc,ask){
    if(prompting||!foreground(wc))return null;
    prompting=true;
    try { const decision=ask();return foreground(wc)?decision:null; }
    finally {prompting=false;}
  }
  function protect(view){
    const wc=view.webContents;
    const guard=event=>{if(!allowed(event.url)){event.preventDefault();if(wc===current())report('Only web addresses can open in this browser.');}};
    wc.on('will-navigate',guard);wc.on('will-redirect',guard);wc.on('will-frame-navigate',guard);
    wc.on('will-attach-webview',event=>event.preventDefault());
    for(const name of ['did-navigate','did-navigate-in-page','did-start-loading','did-stop-loading','page-title-updated'])wc.on(name,()=>{if(current()===wc)emit();});
    wc.on('did-fail-load',(_event,code,description,_url,main)=>{if(current()===wc&&main&&code!==-3)report('Page could not load: '+description);});
    wc.on('render-process-gone',()=>{if(current()===wc)report('Page stopped responding. Reload to try again.');});
    wc.on('destroyed',()=>{const index=pages.indexOf(view);if(index>=0)removeFrom(index);});
    wc.setWindowOpenHandler(({url})=>{
      if(!allowed(url)||!foreground(wc)||pages.length>=5)return {action:'deny'};
      const accept=prompt(wc,()=>dialog.showMessageBoxSync(win,{type:'question',message:'Open a pop-up in the browser panel?',detail:origin(wc.getURL())+' wants to open '+(url==='about:blank'?'a blank window':origin(url))+'.',buttons:['Cancel','Open pop-up'],defaultId:0,cancelId:0})===1);
      if(!accept){report('Pop-up cancelled.');return {action:'deny'};}
      return {action:'allow',overrideBrowserWindowOptions:{webPreferences:preferences()},createWindow(options){
        // Chromium supplies the original WebContents for window.open. Reusing
        // it preserves opener identity, POST data, cookies and referrer policy.
        const view=new WebContentsView({...options,webPreferences:{...options.webPreferences,...preferences()}});
        attach(view);
        return view.webContents;
      }};
    });
  }
  function attach(view){
    view.setVisible(false);
    protect(view);pages.push(view);win.contentView.addChildView(view);
    error='';place();emit();
  }
  function preferences(){return {session:ephemeral,contextIsolation:true,sandbox:true,nodeIntegration:false,nodeIntegrationInSubFrames:false,webSecurity:true,webviewTag:false,devTools:false,navigateOnDragDrop:false,disableDialogs:true};}
  function open(next){
    if(next===token&&current())return;
    dispose();
    if(!ephemeral){
      ephemeral=session.fromPartition('suffice-browser-'+randomUUID(),{cache:false});
      ephemeral.setPermissionRequestHandler((_wc,_kind,callback)=>callback(false));
      ephemeral.setPermissionCheckHandler(()=>false);
      ephemeral.setDevicePermissionHandler(()=>false);
      ephemeral.webRequest.onBeforeRequest((details,callback)=>{
        const uri=details.url,resource=!['mainFrame','subFrame'].includes(details.resourceType);
        const localResource=resource&&/^(blob:|data:)/i.test(uri);
        const socket=resource&&/^wss?:/i.test(uri)&&allowed(uri.replace(/^ws/i,'http'));
        callback({cancel:!allowed(uri)&&!localResource&&!socket});
      });
      ephemeral.on('will-download',(event,item,wc)=>{
        if(!wc||!foreground(wc)||!downloadable(item.getURL())){event.preventDefault();return;}
        const destination=prompt(wc,()=>dialog.showSaveDialogSync(win,{title:'Save download from '+origin(wc.getURL()),defaultPath:require('node:path').join(app.getPath('downloads'),downloadName(item.getFilename()))}));
        if(!destination){event.preventDefault();report('Download cancelled.');return;}
        const owner=token;
        item.setSavePath(destination);
        report('Downloading…');
        item.once('done',(_event,result)=>{if(token===owner)report(result==='completed'?'Download saved.':result==='cancelled'?'Download cancelled.':'Download interrupted.');});
      });
    }
    token=next;
    attach(new WebContentsView({webPreferences:preferences()}));
  }
  function command(value={}){
    const {action,token:next}=value;
    if(typeof next!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(next))throw new Error('Invalid browser tab');
    if(action==='open'){open(next);return state();}
    if(!current()||next!==token)return null;
    const wc=current();
    switch(action){
      case 'bounds': {const [width,height]=win.getContentSize();bounds=rectangle(value.bounds,width,height);visible=bounds.width>0&&bounds.height>0;place();break;}
      case 'hide': visible=false;place();break;
      case 'navigate': if(!allowed(value.url))throw new Error('Enter an HTTP or HTTPS address without a username or password.');error='';void wc.loadURL(value.url).catch(e=>{if(current()===wc&&e.code!=='ERR_ABORTED')report('Page could not load: '+e.message);});break;
      case 'back': if(wc.navigationHistory.canGoBack()){error='';wc.navigationHistory.goBack();}break;
      case 'forward': if(wc.navigationHistory.canGoForward()){error='';wc.navigationHistory.goForward();}break;
      case 'reload': error='';wc.reload();break;
      case 'dismiss-popup': if(pages.length>1)removeFrom(pages.length-1);break;
      case 'close': dispose();return null;
      default: throw new Error('Unknown browser action');
    }
    return state();
  }
  return {command,dispose};
}
module.exports={allowed,rectangle,createElectronBrowserSurface};
