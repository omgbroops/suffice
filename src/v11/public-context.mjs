import {createHash} from 'node:crypto';

const SOURCE=/\.(?:[cm]?[jt]sx?|java|py|rb|go|rs|[ch](?:pp)?|cs|kt|swift|php|scala|exs?|hs|sh|ps1|sql|proto|graphql)$/i;
const TEXT=/\.(?:md|txt|rst|json|toml|ya?ml|xml|html|css)$/i;
const DOC=/(?:^|\/)(?:readme[^/]*|[^/]*(?:api|interface|requirements)[^/]*)$/i;
const BLOCKED=/^(?:\.git|\.codex|\.meta|\.approaches|node_modules|build|dist|target|\.ssh|\.aws|\.azure)$/i;
const SECRET=/^(?:\.env(?:[.-].*)?|\.netrc|\.npmrc|\.pypirc|(?:auth|credentials?|secrets?)(?:[._-][\w-]+)*\.(?:json|toml|ya?ml|env|txt|token|key|pem)|id_(?:rsa|ed25519)(?:\.pub)?)$/i;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const directory=p=>p.slice(0,Math.max(0,p.lastIndexOf('/')));
const basename=p=>p.slice(p.lastIndexOf('/')+1);

function canonical(path){
  if(typeof path!=='string')throw TypeError('Context paths must be strings');
  const p=path.replaceAll('\\','/');
  if(!p||p.includes(':')||p.includes('\0')||p.split('/').some(part=>!part||part==='.'||part==='..'))throw Error(`Invalid baseline path: ${path}`);
  return p;
}
function exclusion(path,entry){
  if(path.split('/').some(p=>BLOCKED.test(p)||SECRET.test(p)||/^\.suffice/i.test(p)))return 'excluded-sensitive-or-metadata';
  if(!Buffer.isBuffer(entry?.bytes))return 'missing-buffer';
  if(entry.bytes.includes(0))return 'binary';
  if(!SOURCE.test(path)&&!TEXT.test(path)&&!/^(?:makefile|dockerfile|license|copying)$/i.test(basename(path)))return 'unsupported-file-type';
  return null;
}

// Original actor-visible files only. This is context selection, not an access-control boundary.
export function collectPublicContext({tree,paths=[]}){
  if(!(tree instanceof Map))throw TypeError('tree must be a baseline Map');
  const baseline=new Map();
  for(const [raw,entry]of tree){
    let path;try{path=canonical(raw);}catch{continue;}
    if(baseline.has(path))throw Error(`Ambiguous baseline path: ${path}`);
    baseline.set(path,entry);
  }
  const explicit=[...new Set(paths.map(canonical))],decoded=new Map(),omitted=[];
  const decoder=new TextDecoder('utf-8',{fatal:true});
  for(const path of explicit){
    if(!baseline.has(path))throw Error(`Missing explicit baseline path: ${path}`);
    const reason=exclusion(path,baseline.get(path));if(reason)throw Error(`Rejected explicit context ${path}: ${reason}`);
  }
  for(const path of [...baseline.keys()].sort(compare)){
    const entry=baseline.get(path);if(exclusion(path,entry))continue;
    try{decoded.set(path,decoder.decode(entry.bytes));}
    catch{if(explicit.includes(path))throw Error(`Invalid UTF-8 context: ${path}`);omitted.push({path,reason:'invalid-utf8'});}
  }
  const directories=new Set(explicit.map(directory));
  const referenceText=explicit.map(p=>decoded.get(p)??'').join('\n');
  const rank=path=>{
    if(directories.has(directory(path))&&SOURCE.test(path)){
      const stem=basename(path).replace(/\.[^.]+$/,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return new RegExp(`\\b${stem}\\b`).test(referenceText)?0:1;
    }
    return DOC.test(path)?2:3;
  };
  const remaining=[...decoded.keys()].filter(p=>!explicit.includes(p)).sort((a,b)=>rank(a)-rank(b)||compare(a,b));
  const files=[...explicit,...remaining].slice(0,100);
  const interfaces=[];let total=0;
  for(const path of [...explicit,...remaining.filter(p=>rank(p)<3)]){
    const bytes=baseline.get(path).bytes;
    const reason=bytes.length>12_000?'per-file-byte-limit':interfaces.length>=12?'file-count-limit':total+bytes.length>48_000?'total-byte-limit':null;
    if(reason){omitted.push({path,reason});continue;}
    interfaces.push({path,text:decoded.get(path),sha256:createHash('sha256').update(bytes).digest('hex')});total+=bytes.length;
  }
  return {files,interfaces,omitted,publicSources:interfaces};
}
