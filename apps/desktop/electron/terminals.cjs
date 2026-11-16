const {realpath,stat}=require('node:fs/promises');
const path=require('node:path');
// xterm must use ConPTY's resize rules rather than pulling old scrollback
// into rows that Windows is about to repaint.
const windowsPty=process.platform==='win32'?{backend:'conpty',buildNumber:Number(require('node:os').release().split('.')[2])}:undefined;
const validId=id=>typeof id==='string'&&/^terminal:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
exports.createTerminalManager=({resolveCwd,emit,spawn=(...args)=>require('node-pty').spawn(...args),resolveShell=async()=>{const {nativeShellPath}=await import('../../../packages/cli/src/shell.mjs');return process.platform==='win32'?nativeShellPath():process.env.SHELL||'/bin/bash';}})=>{
 const records=new Map();let disposed=false;
 const key=(threadId,id)=>{if(typeof threadId!=='string'||!threadId||threadId.length>128||!validId(id))throw new Error('Invalid terminal');return threadId+':'+id;};
 const size=value=>{if(!value||!Number.isInteger(value.cols)||!Number.isInteger(value.rows)||value.cols<2||value.cols>500||value.rows<1||value.rows>300)throw new Error('Invalid terminal size');return {cols:value.cols,rows:value.rows};};
 function flush(record){clearTimeout(record.timer);record.timer=null;if(record.pendingData){const data=record.pendingData;record.pendingData='';emit({type:'data',threadId:record.threadId,id:record.id,sequence:record.sequence,data});}}
 async function create({threadId,id,cols=80,rows=24,ordinal=1,command}){
  if(disposed)throw new Error('Terminals are shutting down');const name=key(threadId,id),dimensions=size({cols,rows});if(records.has(name)){const record=records.get(name);await record.ready;flush(record);return snapshot(record);}
  if(records.size>=32)throw new Error('Close an existing terminal before opening another');
  const record={threadId,id,output:'',pendingData:'',sequence:0,exited:false,cancelled:false};records.set(name,record);
  record.ready=(async()=>{const selected=await resolveCwd(threadId);if(!selected)throw new Error('This thread has no project directory');const cwd=await realpath(selected);if(!(await stat(cwd)).isDirectory())throw new Error('Project directory is unavailable');const shell=command?command[0]:await resolveShell();if(record.cancelled||disposed)throw new Error('Terminal closed');
   const index=Number.isInteger(ordinal)&&ordinal>0&&ordinal<10000?ordinal:1;record.label=path.basename(shell).replace(/\.exe$/i,'')+(index>1?' '+index:'');
   const env={...process.env,TERM:'xterm-256color',COLORTERM:'truecolor',CHERE_INVOKING:'1'};delete env.ELECTRON_RUN_AS_NODE;
   const shellName=path.basename(shell).toLowerCase();const launchArgs=command?command.slice(1):/^(pwsh|powershell)(\.exe)?$/.test(shellName)?['-NoLogo','-NoProfile']:/^cmd(\.exe)?$/.test(shellName)?[]:process.platform==='win32'?['--rcfile',path.join(__dirname,'terminal-bashrc.sh').replaceAll('\\','/'),'-i']:['-l'];record.pty=spawn(shell,launchArgs,{name:'xterm-256color',cwd,env,...dimensions,windowsHide:true});
   record.pty.onData(data=>{if(records.get(name)!==record)return;record.sequence++;record.output+=data;if(record.output.length>512*1024){const cut=record.output.indexOf('\n',record.output.length-512*1024);record.output=record.output.slice(cut<0?-512*1024:cut+1);}record.pendingData+=data;if(!record.timer){record.timer=setTimeout(()=>flush(record),16);record.timer.unref?.();}});
   record.pty.onExit(({exitCode})=>{if(records.get(name)!==record)return;flush(record);record.exited=true;record.exitCode=exitCode;emit({type:'exit',threadId,id,sequence:record.sequence,exitCode});});
  })();
  try{await record.ready;flush(record);return snapshot(record);}catch(error){if(records.get(name)===record)records.delete(name);throw error;}
 }
 const snapshot=record=>({id:record.id,label:record.label,output:record.output,sequence:record.sequence,exited:record.exited,exitCode:record.exitCode,windowsPty});
 function get(threadId,id){const record=records.get(key(threadId,id));if(!record?.pty)throw new Error('Terminal is not open');return record;}
 function close(threadId,id){const name=key(threadId,id),record=records.get(name);if(!record)return;record.cancelled=true;clearTimeout(record.timer);records.delete(name);if(record.pty&&!record.exited){try{record.pty.kill();}catch{}}}
 return {create,write({threadId,id,data}){if(typeof data!=='string'||data.length>1024*1024)throw new Error('Invalid terminal input');const record=get(threadId,id);if(!record.exited)record.pty.write(data);},resize({threadId,id,...dimensions}){const record=get(threadId,id);if(!record.exited)record.pty.resize(...Object.values(size(dimensions)));},close:({threadId,id})=>close(threadId,id),dispose(){disposed=true;for(const record of [...records.values()])close(record.threadId,record.id);},get count(){return records.size;}};
};
