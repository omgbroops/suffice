// Pull request for the checked-out branch, read-only: git for the branch and remote, `gh api` GET for everything else.
const {execFile}=require('node:child_process');

// "git@github.com:o/r.git" or "https://github.com/o/r" -> "o/r"; other hosts -> null
const githubRepo=url=>{const m=/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url||'');return m?`${m[1]}/${m[2]}`:null;};
const githubUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com'?u.href:'';}catch{return '';}};
const spawn=(file,args,cwd)=>new Promise((resolve,reject)=>execFile(file,args,{cwd,windowsHide:true,timeout:20000,maxBuffer:32*1024*1024},(error,stdout,stderr)=>error?reject(Object.assign(error,{stderr})):resolve(String(stdout).trim())));
const git=(root,args)=>spawn('git',['--no-optional-locks','-C',root,...args]);

const CHECK_FAILED=/^(failure|timed_out|cancelled|action_required|startup_failure|stale)$/;
const checkStatus=run=>run.status!=='completed'?'pending':run.conclusion==='success'?'passed':CHECK_FAILED.test(run.conclusion||'')?'failed':'skipped';
const FILE_STATUS={added:'added',removed:'deleted',renamed:'renamed',copied:'renamed'};

function createPrReview({run=spawn,gitRun=git}={}){
 const api=async(path,root)=>JSON.parse(await run('gh',['api',path],root)||'null');
 async function load(root){
  if(!root)return {state:'no-repo',reason:'Choose a project to see its pull request'};
  let branch,remote;
  try{branch=await gitRun(root,['rev-parse','--abbrev-ref','HEAD']);}catch{return {state:'no-repo',reason:'This project is not a git repository'};}
  remote=await gitRun(root,['remote','get-url','origin']).catch(()=>'');
  const repo=githubRepo(remote);
  if(!repo)return {state:'no-remote',branch,reason:'No GitHub remote named origin'};
  if(branch==='HEAD')return {state:'no-pr',repo,branch,reason:'Detached HEAD has no pull request'};
  try{
   const found=await api(`repos/${repo}/pulls?head=${encodeURIComponent(repo.split('/')[0]+':'+branch)}&state=all&per_page=10`,root);
   const pick=(found||[]).find(pr=>pr.state==='open')||(found||[])[0];
   if(!pick)return {state:'no-pr',repo,branch,reason:`No pull request for ${branch}`};
   const n=pick.number,[pr,reviews,files,checks]=await Promise.all([api(`repos/${repo}/pulls/${n}`,root),api(`repos/${repo}/pulls/${n}/reviews?per_page=100`,root),api(`repos/${repo}/pulls/${n}/files?per_page=100`,root),api(`repos/${repo}/commits/${pick.head.sha}/check-runs?per_page=100`,root)]);
   const latest=new Map();for(const r of reviews||[])if(r.user&&r.state!=='PENDING'&&(r.state!=='COMMENTED'||!latest.has(r.user.login)))latest.set(r.user.login,r.state);
   const reviewers=[...latest].map(([login,state])=>({login,state}));
   for(const u of pr.requested_reviewers||[])if(!latest.has(u.login))reviewers.push({login:u.login,state:'REQUESTED'});
   return {state:'ok',repo,branch,pr:{number:n,title:pr.title,url:githubUrl(pr.html_url),status:pr.merged?'merged':pr.state==='closed'?'closed':pr.draft?'draft':'open',author:pr.user?.login||'',base:pr.base?.ref||'',head:pr.head?.ref||branch,additions:pr.additions||0,deletions:pr.deletions||0,reviewers,labels:(pr.labels||[]).map(l=>({name:l.name,color:/^[0-9a-f]{6}$/i.test(l.color||'')?l.color:''}))},
    checks:(checks?.check_runs||[]).map(c=>({name:c.name,status:checkStatus(c),url:githubUrl(c.html_url)})),
    files:(files||[]).map(f=>({path:f.filename,status:FILE_STATUS[f.status]||'modified',additions:f.additions||0,deletions:f.deletions||0,patch:typeof f.patch==='string'?f.patch:null}))};
  }catch(error){
   const text=String(error.stderr||error.message);
   if(error.code==='ENOENT')return {state:'no-gh',repo,branch,reason:'GitHub CLI (gh) is not installed'};
   if(/auth|login|401/i.test(text))return {state:'no-auth',repo,branch,reason:'Run gh auth login to see this pull request'};
   return {state:'error',repo,branch,reason:text.split('\n')[0].slice(0,160)};
  }
 }
 return {load};
}
module.exports={createPrReview,githubRepo,githubUrl};
