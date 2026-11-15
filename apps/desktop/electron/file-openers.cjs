const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
async function targetPath(root,name='',{external=false}={}){
 if(!root||typeof name!=='string'||name.includes('\0')||(!external&&path.isAbsolute(name)))throw new Error('Invalid file path');
 const base=await fs.realpath(root),file=await fs.realpath(path.resolve(base,name)),relative=path.relative(base,file);
 if(!external&&(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)))throw new Error('File is outside this project');return file;
}
const brandIcon=id=>{const body=id==='terminal'?'<rect x="1" y="3" width="22" height="18" rx="3" fill="#343a43"/><path d="m6 9 4 3-4 3m6 1h6" fill="none" stroke="white" stroke-width="1.7"/>':id==='gitbash'?'<rect x="3" y="3" width="18" height="18" rx="2" transform="rotate(45 12 12)" fill="#f05032"/><path d="m8 6 8 8M9 7v10" stroke="white" stroke-width="1.7"/><g fill="white"><circle cx="9" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="16" cy="14" r="2"/></g>':null;return body?'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'+body+'</svg>').toString('base64'):null;};
function createFileOpeners({app,shell,platform=process.platform}){
 async function applications(){
  const home=os.homedir(),candidates=[];
  const add=(id,label,executable,kind='editor',args=[])=>candidates.push({id,label,executable,kind,args});
  if(platform==='win32'){
   const local=process.env.LOCALAPPDATA||path.join(home,'AppData/Local'),programs=process.env.ProgramFiles||'C:/Program Files';
   for(const base of [path.join(local,'Programs'),programs]){add('vscode','VS Code',path.join(base,'Microsoft VS Code/Code.exe'));add('cursor','Cursor',path.join(base,'cursor/Cursor.exe'));add('windsurf','Windsurf',path.join(base,'Windsurf/Windsurf.exe'));}
   add('github','GitHub Desktop',path.join(local,'GitHubDesktop/GitHubDesktop.exe'),'project');
   add('powershell','PowerShell',path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),'terminal',['-NoExit']);
   add('terminal','Windows Terminal',path.join(local,'Microsoft/WindowsApps/wt.exe'),'wt');
   add('gitbash','Git Bash',path.join(programs,'Git/git-bash.exe'),'gitbash');
   try{for(const dir of await fs.readdir(path.join(programs,'JetBrains'))){for(const [id,label,exe] of [['idea','IntelliJ IDEA','idea64.exe'],['webstorm','WebStorm','webstorm64.exe']])add(id,label,path.join(programs,'JetBrains',dir,'bin',exe));}}catch{}
  }else if(platform==='darwin'){
   for(const base of ['/Applications',path.join(home,'Applications')])for(const [id,label,name,kind] of [['vscode','VS Code','Visual Studio Code.app'],['cursor','Cursor','Cursor.app'],['windsurf','Windsurf','Windsurf.app'],['zed','Zed','Zed.app'],['github','GitHub Desktop','GitHub Desktop.app','project'],['idea','IntelliJ IDEA','IntelliJ IDEA.app'],['webstorm','WebStorm','WebStorm.app'],['iterm','iTerm','iTerm.app','terminal']])add(id,label,path.join(base,name),kind||'editor');
   add('terminal','Terminal','/System/Applications/Utilities/Terminal.app','terminal');
  }else{
   for(const [id,label,command,kind] of [['vscode','VS Code','code'],['cursor','Cursor','cursor'],['zed','Zed','zed'],['idea','IntelliJ IDEA','idea'],['webstorm','WebStorm','webstorm'],['terminal','Terminal','x-terminal-emulator','terminal'],['gnome-terminal','GNOME Terminal','gnome-terminal','terminal'],['konsole','Konsole','konsole','terminal']]){try{const {stdout}=await promisify(execFile)('which',[command],{timeout:1500});add(id,label,stdout.trim(),kind||'editor');}catch{}}
  }
  const found=[];for(const candidate of candidates){if(found.some(item=>item.id===candidate.id))continue;try{await fs.access(candidate.executable);found.push(candidate);}catch{}}return found;
 }
 async function options(root,name){const file=await targetPath(root,name,{external:true}),apps=await applications();const entries=[{id:'default',label:'Default app',iconPath:file},...apps.map(item=>({...item,iconPath:item.executable})),{id:'folder',label:platform==='darwin'?'Show in Finder':platform==='win32'?'Show in Explorer':'Show in folder',iconPath:platform==='win32'?path.join(process.env.SystemRoot||'C:/Windows','explorer.exe'):path.dirname(file)}];return Promise.all(entries.map(async item=>({id:item.id,label:item.label,icon:(platform==='win32'&&brandIcon(item.id))||await app.getFileIcon(item.iconPath,{size:'small'}).then(icon=>icon.toDataURL()).catch(()=>null)})));}
 async function open(root,name,id){const file=await targetPath(root,name,{external:true});if(id==='default'){const error=await shell.openPath(file);if(error)throw new Error(error);return;}if(id==='folder'){shell.showItemInFolder(file);return;}
  const target=(await applications()).find(item=>item.id===id);if(!target)throw new Error('Application is no longer available');
  const cwd=(await fs.stat(file)).isDirectory()?file:path.dirname(file);let executable=target.executable,args;
  if(platform==='darwin'){executable='/usr/bin/open';args=['-a',target.executable,target.kind==='editor'?file:cwd];}
  else if(target.kind==='wt')args=['-d',cwd];else if(target.kind==='gitbash')args=['--cd='+cwd];else if(target.kind==='terminal')args=target.args;else args=[target.kind==='project'?root:file];
  await new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd,detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
 }
 return {options,open};
}
module.exports={createFileOpeners,targetPath};
