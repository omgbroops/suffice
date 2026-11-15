import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const addonPath=fileURLToPath(new URL(`../native/suffice-fs-${process.platform}-${process.arch}.node`,import.meta.url));
let cached;
let busy=false;
function loadAddon() {
  if(cached!==undefined)return cached;
  try {const addon=require(addonPath);cached=typeof addon.walk==='function'?addon:null;} catch {cached=null;}
  return cached;
}

export function createNativeFiles({load=loadAddon}={}) {
  return async function nativeFiles(root,directory='') {
    if(busy)return null;
    busy=true;
    try {
      const addon=load();if(!addon)return null;
      const paths=await addon.walk(resolve(root,directory));
      if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||!p||p.split('/').some(part=>!part||part.startsWith('.')||part==='node_modules')))return null;
      const tree=new Map();
      for(const path of paths) {
        let children=tree;const parts=path.split('/');
        for(let i=0;i<parts.length;i++) {
          const leaf=i===parts.length-1,existing=children.get(parts[i]);
          if(existing!==undefined&&(leaf||existing===null))return null;
          if(existing===undefined)children.set(parts[i],leaf?null:new Map());
          if(!leaf)children=children.get(parts[i]);
        }
      }
      const sorted=[];
      const visit=(children,prefix='')=>{for(const [name,subtree] of [...children].sort((a,b)=>a[0].localeCompare(b[0]))) {const path=prefix?`${prefix}/${name}`:name;if(subtree===null)sorted.push([directory,path].filter(Boolean).join('/'));else visit(subtree,path);}};
      visit(tree);return sorted;
    } catch {return null;}
    finally {busy=false;}
  };
}
export const nativeFiles=createNativeFiles();
