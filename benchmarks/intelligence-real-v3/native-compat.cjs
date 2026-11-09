// Restore the legacy SourceMap write convention under pinned modern Node.
const fs=require('fs'),write=fs.writeFileSync;
fs.writeFileSync=function(file,data){
  const args=Array.prototype.slice.call(arguments);
  if(data&&typeof data==='object'&&data.constructor&&data.constructor.name==='SourceMap'&&typeof data.toString==='function')args[1]=data.toString();
  return write.apply(this,args);
};
exports.normalizeSourceMapPaths=function(text){
  if(!/^\s*\{/.test(text))return text;
  let value;try{value=JSON.parse(text);}catch{return text;}
  if(value.version!==3||!Array.isArray(value.sources)||typeof value.mappings!=='string')return text;
  const normalize=value=>typeof value==='string'?value.replace(/\\/g,'/'):value;
  value.sources=value.sources.map(normalize);
  for(const name of ['file','sourceRoot'])if(typeof value[name]==='string')value[name]=normalize(value[name]);
  return JSON.stringify(value);
};
