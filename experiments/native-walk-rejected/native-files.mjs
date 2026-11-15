import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const maximumBytes=32*1024*1024;
const timeoutMs=30_000;
const defaultBinary=fileURLToPath(new URL(`../native/suffice-fs-${process.platform}-${process.arch}${process.platform==='win32'?'.exe':''}`,import.meta.url));

// A failed or unavailable helper is only an optimization failure: the caller
// retries the authoritative JavaScript traversal, including its normal errors.
export function createNativeFiles({spawn:spawnProcess=spawn,timeoutMs:deadline=timeoutMs,maximumBytes:limit=maximumBytes}={}) {
 return function nativeFiles(root,directory='',binary=defaultBinary) {
  return new Promise(done=>{
    let child,settled=false,size=0,chunks=[];
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);done(value);};
    try { child=spawnProcess(binary,['--protocol=1',resolve(root,directory)],{stdio:['ignore','pipe','ignore'],windowsHide:true}); }
    catch { done(null);return; }
    const timer=setTimeout(()=>{child.kill();finish(null);},deadline);
    child.on('error',()=>finish(null));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>limit){child.kill();finish(null);return;}chunks.push(chunk);});
    child.stdout.on('error',()=>{child.kill();finish(null);});
    child.on('close',code=>{
      if(settled)return;
      if(code!==0)return finish(null);
      try {
        const paths=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||!p||p.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.')||part==='node_modules')))return finish(null);
        // Rebuild the tree to sort siblings stably, even when localeCompare
        // considers distinct names equal and one of them is a directory.
        const tree=new Map();
        for(const path of paths) {
          let children=tree;
          const parts=path.split('/');
          for(let i=0;i<parts.length;i++) {
            const leaf=i===parts.length-1,existing=children.get(parts[i]);
            if(existing!==undefined && (leaf||existing===null))return finish(null);
            if(existing===undefined)children.set(parts[i],leaf?null:new Map());
            if(!leaf)children=children.get(parts[i]);
          }
        }
        const sorted=[];
        const visit=(children,prefix='')=>{for(const [name,subtree] of [...children].sort((a,b)=>a[0].localeCompare(b[0]))) {const path=prefix?`${prefix}/${name}`:name;if(subtree===null)sorted.push([directory,path].filter(Boolean).join('/'));else visit(subtree,path);}};
        visit(tree);finish(sorted);
      } catch {finish(null);}
    });
  });
 };
}
export const nativeFiles=createNativeFiles();
