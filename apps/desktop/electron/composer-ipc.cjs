// IPC for the neon composer: git worktree for a project, and offline dictation through whisper.cpp.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {git}=require('./git.cjs');
const {sufficeHome}=require('./paths.cjs');
const exec=promisify(execFile);

const home=os.homedir();
const exists=p=>{try{return fs.statSync(p).isFile();}catch{return false;}};

function findBinary(){
  const dirs=[...(process.env.PATH||'').split(path.delimiter),'/opt/homebrew/bin','/usr/local/bin'];
  for(const d of dirs){if(d){const p=path.join(d,'whisper-cli');if(exists(p))return p;}}
  return null;
}
function findModel(){
  const candidates=[process.env.SUFFICE_WHISPER_MODEL,path.join(home,'.claude/models/ggml-base.en.bin'),path.join(home,'.cache/halftone/ggml-base.en.bin')];
  try{for(const f of fs.readdirSync('/opt/homebrew/share/whisper.cpp'))if(/^ggml-.*\.bin$/.test(f))candidates.push(path.join('/opt/homebrew/share/whisper.cpp',f));}catch{}
  return candidates.find(p=>p&&exists(p))||null;
}
function wav(pcm){
  const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
  return Buffer.concat([h,pcm]);
}

exports.register=({handle,projects,request,getProject,setProject,isBusy})=>{
  handle('stt-available',()=>Boolean(findBinary()&&findModel()));
  // input: 16 kHz mono signed 16-bit little-endian PCM, at most ~2 minutes
  handle('transcribe',async pcm=>{
    const bin=findBinary(),model=findModel();
    if(!bin||!model)throw new Error('Offline speech-to-text is not installed');
    const data=Buffer.from(pcm instanceof ArrayBuffer?new Uint8Array(pcm):pcm);
    if(!data.length||data.length%2||data.length>4_000_000)throw new Error('Recording is empty or too long');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'suffice-stt-'));
    try{
      fs.writeFileSync(path.join(dir,'in.wav'),wav(data));
      await exec(bin,['-m',model,'-f',path.join(dir,'in.wav'),'-nt','-np','-otxt','-of',path.join(dir,'out')],{timeout:120000,windowsHide:true});
      return fs.readFileSync(path.join(dir,'out.txt'),'utf8').replace(/\[BLANK_AUDIO\]/g,'').replace(/\s+/g,' ').trim();
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
  // local git only: never fetches, pushes or touches a remote
  handle('worktree-create',async()=>{
    const stopFirst=()=>{if(isBusy())throw new Error('Stop the current task first');};
    stopFirst();
    const current=getProject();if(!current)throw new Error('Choose a project first');
    let top;try{top=await git(current,['rev-parse','--show-toplevel'],{timeout:5000});}catch{throw new Error('This project is not a git repository');}
    const hex=crypto.randomBytes(3).toString('hex'),root=path.join(sufficeHome(),'worktrees'),dest=path.join(root,`${path.basename(top)}-${hex}`);
    fs.mkdirSync(root,{recursive:true});
    try{await git(top,['worktree','add','-b',`suffice/${hex}`,'--',dest,'HEAD'],{timeout:60000});}catch(error){throw new Error(String(error.stderr||error.message).trim().split('\n').pop());}
    const item=await projects.add(fs.realpathSync(dest));
    stopFirst();
    await request('reset');setProject(item.path);
    return {...item,git:await projects.git(item.path)};
  });
};
