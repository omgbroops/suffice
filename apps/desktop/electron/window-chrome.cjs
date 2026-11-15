// A preview changes caption rendering only; it must not spoof the host platform.
exports.windowChrome = ({platform=process.platform,preview,packaged=false}={}) => {
  if(platform==='darwin')return {mode:'macos-native',options:{frame:true,titleBarStyle:'hidden',trafficLightPosition:{x:16,y:19}}};
  return {mode:!packaged&&preview==='macos'?'macos-preview':'windows',options:{frame:false}};
};
