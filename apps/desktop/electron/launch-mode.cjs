// Renaming Electron for development branding makes app.isPackaged true.
// defaultApp still identifies a source app passed on the command line.
exports.isInstalledApp=(app,defaultApp=process.defaultApp)=>app.isPackaged&&!defaultApp;
