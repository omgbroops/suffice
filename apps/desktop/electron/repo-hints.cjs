const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
// Real repo state for the start screen. shortcut: failing tests come from JUnit XML only, add other reporters when a project needs them.
const git=(root,args)=>new Promise(r=>execFile('git',['--no-optional-locks','-c','core.fsmonitor=false','-C',root,...args],{windowsHide:true,timeout:5000,maxBuffer:1024*1024},(e,out)=>r(e&&e.code!==1?'':out)));
const parseTodos=out=>out.split('\n').map(l=>/^([^:]+):(\d+):.*?\b(TODO|FIXME)\b(?:\([^)]*\))?[:\s]*(.*)$/.exec(l)).filter(Boolean).map(m=>({file:m[1],line:Number(m[2]),kind:m[3],text:m[4].replace(/\s*(\*\/|-->)\s*$/,'').trim().slice(0,90)})).filter(t=>t.text);
const parseJunit=xml=>[...xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].filter(m=>m[3]&&/<(failure|error)\b/.test(m[3])).map(m=>/\bname="([^"]*)"/.exec(m[1])?.[1]).filter(Boolean).map(n=>n.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').slice(0,100));
async function failing(root){for(const f of ['junit.xml','test-results/junit.xml','reports/junit.xml']){try{const p=path.join(root,f);const st=await fs.stat(p);if(st.size>5e6)continue;const names=parseJunit(await fs.readFile(p,'utf8'));if(names.length)return names.slice(0,5);}catch{}}return [];}
async function hints(root){
 if(!root)return {todos:[],failing:[]};
 const [grep,fails]=await Promise.all([git(root,['grep','-n','-I','--max-count=1','-E','\\b(TODO|FIXME)\\b','--','.',':!*.lock',':!*.json',':!*.md',':!*test*',':!vendor']),failing(root)]);
 return {todos:parseTodos(grep).slice(0,5),failing:fails};
}
module.exports={hints,parseTodos,parseJunit};
