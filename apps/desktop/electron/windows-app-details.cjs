const path=require('node:path');
const {mkdirSync,readFileSync,writeFileSync,existsSync}=require('node:fs');
const {createHash}=require('node:crypto');
exports.windowsAppId=packaged=>packaged?'com.suffice.desktop':'com.suffice.desktop.development';
function shellIcon(userData,source){
 const bytes=readFileSync(source),digest=createHash('sha256').update(bytes).digest('hex').slice(0,16);
 const directory=path.join(userData,'app-icons'),file=path.join(directory,`suffice-${digest}.ico`);
 mkdirSync(directory,{recursive:true});if(!existsSync(file))writeFileSync(file,bytes);return file;
}
// Windows uses separate metadata for the taskbar group/pinned shortcut and preview.
function quoteWindowsArg(value){if(value&&!/[\s"]/.test(value))return value;return '"'+value.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';}
exports.windowsAppDetails=({appPath,exePath,userData,iconPath,packaged=false,shortcutPath})=>({appId:exports.windowsAppId(packaged),appIconPath:iconPath,appIconIndex:0,relaunchDisplayName:'Suffice',relaunchCommand:shortcutPath?quoteWindowsArg(shortcutPath):[exePath,...(packaged?[]:[appPath]),'--user-data-dir='+userData].map(quoteWindowsArg).join(' ')});
exports.applyWindowsAppDetails=({app,win,shell,iconPath})=>{
 const appPath=app.getAppPath(),exePath=process.execPath,userData=app.getPath('userData'),packaged=require('./launch-mode.cjs').isInstalledApp(app),shortcutPath=path.join(userData,'Suffice.lnk');
 // A stable, content-addressed icon avoids Explorer reusing a stale resource at
 // an overwritten path. Development also has its own Windows taskbar identity.
 try{iconPath=shellIcon(userData,iconPath);}catch(error){console.warn('Could not cache Suffice shell icon:',error.message);}
 const args=[...(packaged?[]:[appPath]),'--user-data-dir='+userData].map(quoteWindowsArg).join(' ');
 // Keep the window relaunch property short even in deeply nested development worktrees.
 let shortcut=false;try{mkdirSync(userData,{recursive:true});shortcut=shell.writeShortcutLink(shortcutPath,'create',{target:exePath,args,cwd:packaged?path.dirname(exePath):process.cwd(),icon:iconPath,iconIndex:0,description:'Suffice',appUserModelId:exports.windowsAppId(packaged)});}catch(error){console.warn('Could not update Suffice taskbar shortcut:',error.message);}
 win.setAppDetails(exports.windowsAppDetails({appPath,exePath,userData,iconPath,packaged,shortcutPath:shortcut?shortcutPath:undefined}));
};
