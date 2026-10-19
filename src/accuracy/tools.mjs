import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,stat} from 'node:fs/promises';
import {Type} from 'typebox';
import {repositoryTools} from '../../packages/cli/src/tools.mjs';
import {workspaceFile} from '../pipeline/context.mjs';

const run=promisify(execFile);
const result=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,details:{}});
const cap=(text,limit=16000)=>({text:text.slice(0,limit),truncated:text.length>limit});
/** Fixed argv only: no shell, editable tool, external diff or textconv execution. */
export async function createReviewTools({workspace}) {
  const inspection={sourceReads:[],patchReads:[],baseline:'HEAD',diffScope:'HEAD plus current staged/unstaged/untracked workspace changes'};
  const git=async(args,signal)=>{const {stdout}=await run('git',['--literal-pathspecs','-c','core.fsmonitor=false',...args],{cwd:workspace,shell:false,timeout:10000,maxBuffer:1024*1024,encoding:'utf8',signal});return stdout;};
  inspection.baseline=(await git(['rev-parse','--verify','HEAD'])).trim();
  const native=repositoryTools({workspace}).filter(t=>['read','symbols','symbol_read','symbol_references'].includes(t.name));
  const tools=native.map(tool=>({...tool,async execute(id,args,signal,onUpdate){
    // Require explicit paths for AST navigation, keeping reads bounded to selected files.
    if(tool.name!=='read'&&!args.path)throw Error('Review navigation requires an explicit source path');
    await workspaceFile(workspace,args.path);
    const out=await tool.execute(id,args,signal,onUpdate);
    if(!out.isError&&(tool.name==='read'||tool.name==='symbol_read')) {
      const returned=out.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'';
      // Archive exactly the source text exposed to the reviewer, not a fresh full-file read.
      let text=returned;
      if(tool.name==='symbol_read')try{text=JSON.parse(returned).text.split('\n').map(line=>line.replace(/^\d+: /,'')).join('\n');}catch{text='';}
      if(text)inspection.sourceReads.push({path:args.path,text});
    }
    return out;
  }}));
  tools.push({name:'changes',label:'changes',description:'List up to 80 changed paths or read a bounded actual HEAD-to-working-tree patch for one path. Includes untracked text files. No commands accepted.',
    parameters:Type.Object({mode:Type.Union([Type.Literal('list'),Type.Literal('diff')]),path:Type.Optional(Type.String())}),
    async execute(_id,args,signal) {
      if(args.mode==='list') {
        const tracked=await git(['diff','--no-ext-diff','--no-textconv','--name-only','-z',inspection.baseline,'--'],signal);
        const untracked=await git(['ls-files','--others','--exclude-standard','-z'],signal);
        const paths=[...new Set((tracked+untracked).split('\0').filter(Boolean))];
        if(!paths.length)inspection.emptyPatch=true;
        return result({baseline:inspection.baseline,paths:paths.slice(0,80),omitted:Math.max(0,paths.length-80)});
      }
      if(args.mode!=='diff'||!args.path)throw Error('Diff requires a relative file path');
      // A deletion has no current file; validate its parent via the existing path guard.
      const {repositoryPath}=await import('../../packages/cli/src/workspace.mjs');
      await repositoryPath(workspace,args.path);
      if(args.path.startsWith('-')||args.path.includes('\\')||args.path.includes(':')||args.path.startsWith('/'))throw Error('Expected a relative workspace path');
      let patch=await git(['diff','--no-ext-diff','--no-textconv','--no-renames','--unified=5',inspection.baseline,'--',args.path],signal);
      if(!patch) {
        const untracked=await git(['ls-files','--others','--exclude-standard','-z','--',args.path],signal);
        if(untracked.split('\0').includes(args.path)) {
          const file=await workspaceFile(workspace,args.path);
          if((await stat(file.absolutePath)).size>128*1024)throw Error('Untracked patch exceeds size limit');
          const source=await readFile(file.absolutePath,'utf8');
          if(source.includes('\0'))throw Error('Binary patch is unavailable');
          patch=`New untracked file: ${args.path}\n`+source.split('\n').map(line=>'+'+line).join('\n');
        }
      }
      if(patch)inspection.patchReads.push(args.path);
      return result({path:args.path,baseline:inspection.baseline,...cap(patch)});
    }});
  return {tools,inspection};
}
