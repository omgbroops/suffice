// Every renderer call enters here. Only the app's own page in the main frame may call.
function createIpc({ipcMain,getWindow,entryUrl}){
 const entry=new URL(entryUrl);
 function trusted(event){
  const win=getWindow(),frame=event.senderFrame;
  if(!win||!frame||frame!==win.webContents.mainFrame)return false;
  try{const url=new URL(frame.url);return url.protocol===entry.protocol&&url.pathname===entry.pathname;}catch{return false;}
 }
 function handle(name,handler){
  ipcMain.handle(`suffice:${name}`,(event,...args)=>{
   if(!trusted(event))throw new Error('Untrusted frame');
   return handler(...args);
  });
 }
 return {handle,trusted};
}
module.exports={createIpc};
