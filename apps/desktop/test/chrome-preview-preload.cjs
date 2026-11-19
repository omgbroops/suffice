// Test-only: render the custom macOS-style caption (macos-preview) while running on a real Mac, where the app normally uses native traffic lights.
const Module=require('node:module');
const load=Module._load;
Module._load=function(request,...rest){
 const mod=load.call(this,request,...rest);
 if(!/window-chrome\.cjs$/.test(request))return mod;
 return {windowChrome:opts=>mod.windowChrome({...opts,platform:'win32'})};
};
