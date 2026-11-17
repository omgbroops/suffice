const {mkdirSync}=require('node:fs');
const path=require('node:path');
exports.configureDesktopProfile=(app,{packaged,argv=process.argv})=>{
 if(!packaged||argv.some(arg=>arg.startsWith('--user-data-dir')))return;
 const profile=path.join(app.getPath('appData'),'@suffice','desktop');
 // Electron rejects a setPath override when its directory does not exist yet.
 mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
};
