const path=require('node:path');
const {mkdirSync}=require('node:fs');
// Windows uses separate metadata for the taskbar group/pinned shortcut and preview.
function quoteWindowsArg(value){if(value&&!/[\s"]/.test(value))return value;return '"'+value.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';}
exports.windowsAppDetails=({appPath,exePath,userData,iconPath,packaged=false,shortcutPath})=>({appId:'com.suffice.desktop',appIconPath:iconPath,appIconIndex:0,relaunchDisplayName:'Suffice',relaunchCommand:shortcutPath?quoteWindowsArg(shortcutPath):[exePath,...(packaged?[]:[appPath]),'--user-data-dir='+userData].map(quoteWindowsArg).join(' ')});
exports.applyWindowsAppDetails=({app,win,shell,iconPath})=>{
 const appPath=app.getAppPath(),exePath=process.execPath,userData=app.getPath('userData'),packaged=app.isPackaged,shortcutPath=path.join(userData,'Suffice.lnk');
 const args=[...(packaged?[]:[appPath]),'--user-data-dir='+userData].map(quoteWindowsArg).join(' ');
 // Keep the window relaunch property short even in deeply nested development worktrees.
 let shortcut=false;try{mkdirSync(userData,{recursive:true});shortcut=shell.writeShortcutLink(shortcutPath,'create',{target:exePath,args,cwd:packaged?path.dirname(exePath):process.cwd(),icon:iconPath,iconIndex:0,description:'Suffice',appUserModelId:'com.suffice.desktop'});}catch(error){console.warn('Could not update Suffice taskbar shortcut:',error.message);}
 win.setAppDetails(exports.windowsAppDetails({appPath,exePath,userData,iconPath,packaged,shortcutPath:shortcut?shortcutPath:undefined}));
};
