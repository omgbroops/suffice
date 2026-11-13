// Git and GitHub data for the sidebar and composer: branch, author, open issues and pull requests.
// Uses the git and gh command-line tools the user already has; nothing here writes to the repo.
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
const path=require('node:path');
// Apps started from Finder get a bare PATH; add the usual tool locations.
const PATH=[process.env.PATH,'/opt/homebrew/bin','/usr/local/bin',path.join(process.env.HOME||'','.local/bin'),path.join(process.env.HOME||'','.local/share/mise/shims')].filter(Boolean).join(path.delimiter);
const run=(cmd,args,cwd)=>exec(cmd,args,{cwd,windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,env:{...process.env,PATH,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0'}}).then(r=>r.stdout.trim());
const git=(root,args)=>run('git',['--no-optional-locks','-C',root,...args],root);

// "git@github.com:o/r.git" or "https://github.com/o/r" -> "o/r"; other hosts -> null
function githubRepo(url){const m=/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url||'');return m?`${m[1]}/${m[2]}`:null;}

async function info(root){
 if(!root)return {git:false};
 let branch;try{branch=await git(root,['rev-parse','--abbrev-ref','HEAD']);}catch{return {git:false};}
 const [remote,author]=await Promise.all([git(root,['remote','get-url','origin']).catch(()=>''),git(root,['config','user.name']).catch(()=>'')]);
 return {git:true,branch,author,repo:githubRepo(remote)};
}

let login=null;
async function user(){if(login!==null)return login;try{login=await run('gh',['api','user','--jq','.login']);}catch{login='';}return login;}

async function list(root,kind){
 const meta=await info(root);
 if(!meta.git)return {available:false,reason:'This project is not a git repository',items:[]};
 if(!meta.repo)return {available:false,reason:'No GitHub remote named origin',items:[]};
 const fields=kind==='pr'?'number,title,url,updatedAt,isDraft,headRefName,author':'number,title,url,updatedAt,author';
 try{
  const out=await run('gh',[kind,'list','--repo',meta.repo,'--state','open','--limit','50','--json',fields],root);
  return {available:true,repo:meta.repo,items:JSON.parse(out||'[]').map(x=>({number:x.number,title:x.title,url:x.url,updated:Date.parse(x.updatedAt),author:x.author?.login||'',draft:Boolean(x.isDraft),branch:x.headRefName||''}))};
 }catch(error){
  const text=String(error.stderr||error.message);
  return {available:false,repo:meta.repo,reason:error.code==='ENOENT'?'GitHub CLI (gh) is not installed':/auth|login/i.test(text)?'Run gh auth login to see GitHub data':text.split('\n')[0].slice(0,160),items:[]};
 }
}

// Newest pull request per head branch, any state, for the thread rows.
async function branchPrs(root){
 const meta=await info(root);if(!meta.repo)return {};
 try{const out=await run('gh',['pr','list','--repo',meta.repo,'--state','all','--limit','200','--json','number,state,isDraft,headRefName,url'],root);
  const map={};for(const x of JSON.parse(out||'[]'))map[x.headRefName]??={number:x.number,state:x.isDraft&&x.state==='OPEN'?'DRAFT':x.state,url:x.url};return map;
 }catch{return {};}
}

// Only GitHub pages open externally from this panel.
const safeUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com';}catch{return false;}};

module.exports={info,user,issues:root=>list(root,'issue'),prs:root=>list(root,'pr'),branchPrs,githubRepo,safeUrl};
