require('./test/setup');
// Original CLI fixtures use POSIX shell commands. Preserve those commands and
// assertions, with a quoted native Node launcher and the installed Git Bash.
const childProcess=require('child_process'),originalExec=childProcess.exec;
childProcess.exec=function(command,callback){
  if(!/^\s*alias svelte=/m.test(command))return originalExec.apply(this,arguments);
  const normalize=p=>p.replace(/\\/g,'/'),runtime=normalize(require('path').resolve('node_modules/.suffice-node16/node.exe')),bin=normalize(require('path').resolve('svelte'));
  command="shopt -s expand_aliases\n"+command.replace(/^\s*alias svelte=.*$/m,`alias svelte='"${runtime}" --max-old-space-size=384 "${bin}"'`);
  return originalExec.call(this,command,{shell:'C:/Program Files/Git/bin/bash.exe',env:{...process.env,NODE_OPTIONS:''}},callback);
};
// tiny-glob 0.2.0 joins Windows backslashes but matches slash-only patterns,
// discovering zero tests. Enumerate the same two original patterns natively.
const fs=require('fs'),path=require('path');
function sourceTests(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.isDirectory())sourceTests(path.join(dir,e.name));
  else if(e.isFile()&&e.name==='__test__.js')require('./'+path.join(dir,e.name));
}}
sourceTests('src');
for(const dir of fs.readdirSync('test',{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name)){
  const p=dir+'/index.js';if(!fs.existsSync('test/'+p))continue;
  // This suite requires Nightmare/Electron. It contains no dataset F2P/P2P labels.
  if(p!=='custom-elements/index.js')require('./test/'+p);
}
