// The folders the renderer may point git, gh and the scheduler at: saved projects, plus
// (for read-only GitHub lookups) the folders of saved threads.
const path=require('node:path');
const norm=p=>typeof p==='string'&&path.isAbsolute(p)?path.resolve(p):null;
function createKnownPaths({projects,threadCwds}){
 const isProject=p=>{const n=norm(p);return n!==null&&projects.paths().some(x=>path.resolve(x)===n);};
 const isKnown=p=>{const n=norm(p);return n!==null&&(isProject(n)||[...threadCwds()].some(x=>norm(x)===n));};
 return {isProject,isKnown};
}
module.exports={createKnownPaths};
