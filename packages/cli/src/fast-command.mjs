import {mkdtemp,cp,rm,readdir,readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,basename,dirname} from 'node:path';
import {createSufficeSession} from './session.mjs';

// /fast — the benchmark winner (race-3-low-prefill) as an in-session command.
//   /fast            show state
//   /fast on|off     toggle the low-effort speed profile on the live session
//   /fast <task>     race the task: 3 attempts on isolated workspace copies,
//                    first completed patch is applied back to the real worktree
const RACE_ATTEMPTS=[
  {hint:''},
  {hint:'Prefer the smallest correct change. Do not refactor or reformat unrelated code.'},
  {hint:'Check edge cases and the full contract before finishing.'},
];
const SKIP_COPY=new Set(['.git','node_modules']);
const SKIP_DIFF=new Set(['.git','node_modules','.suffice','.pi']);

export async function listFiles(dir,base=dir,out=[]){
  for(const e of await readdir(dir,{withFileTypes:true})){
    if(SKIP_DIFF.has(e.name)) continue;
    const p=join(dir,e.name);
    if(e.isDirectory()) await listFiles(p,base,out);
    else out.push(relative(base,p));
  }
  return out;
}

// Files that differ between `from` and `to`: changed = created or edited in `to`,
// deleted = present in `from` but gone in `to`.
export async function diffFiles(from,to){
  const fromFiles=new Set(await listFiles(from)),toFiles=await listFiles(to);
  const toSet=new Set(toFiles),changed=[],deleted=[];
  for(const rel of toFiles){
    if(!fromFiles.has(rel)){changed.push(rel);continue;}
    const next=await readFile(join(to,rel)),prior=await readFile(join(from,rel)).catch(()=>null);
    if(!prior||!next.equals(prior)) changed.push(rel);
  }
  for(const rel of fromFiles) if(!toSet.has(rel)) deleted.push(rel);
  return {changed,deleted};
}

// Applies what the winning attempt changed relative to the pre-race snapshot onto
// the live worktree, so edits the user made during the race on other files survive.
export async function applyPatch(base,snapshot,attempt){
  const {changed,deleted}=await diffFiles(snapshot,attempt);
  for(const rel of changed){const to=join(base,rel);await mkdir(dirname(to),{recursive:true});await writeFile(to,await readFile(join(attempt,rel)));}
  for(const rel of deleted) await rm(join(base,rel),{force:true});
  return changed.length+deleted.length;
}

export async function workspacePrefill(dir){
  const files=(await listFiles(dir)).sort(),cap=200;
  const shown=files.slice(0,cap);
  return 'Workspace layout ('+files.length+' files'+(files.length>cap?', first '+cap+' shown':'')+'):\n'+shown.join('\n')+'\n\nPrefer the smallest correct diff — targeted edits over full-file rewrites.';
}

export function sufficeFastCommand(options,runtime){
  let fastOn=false,priorEffort=null,racing=false;
  return pi=>{
    pi.registerCommand('fast',{
      description:'Fast mode: /fast <task> races 3 attempts and applies the first completed patch; /fast on|off toggles low-effort speed',
      handler:async(args,ctx)=>{
        const input=args.trim();
        if(!input||input==='status'){
          ctx.ui.notify(`Fast mode ${fastOn?'on':'off'} · /fast <task> runs a raced task · /fast on|off toggles effort`,'info');
          return;
        }
        if(input==='on'||input==='off'){
          const want=input==='on';
          if(want===fastOn){ctx.ui.notify(`Fast mode already ${want?'on':'off'}`,'info');return;}
          fastOn=want;
          if(want){priorEffort=ctx.thinkingLevel??'medium';pi.setThinkingLevel('low');}
          else pi.setThinkingLevel(priorEffort??'medium');
          ctx.ui.notify(want?'Fast mode on — low effort; /fast <task> races 3 attempts':'Fast mode off — effort restored','info');
          return;
        }
        if(racing){ctx.ui.notify('A fast race is already running','warning');return;}
        racing=true;
        const base=ctx.cwd,raceDir=await mkdtemp(join(tmpdir(),'suffice-fast-'));
        ctx.ui.notify('Fast race started — 3 attempts on workspace copies','info');
        const controls=[];
        let winner=-1;
        try{
          await ctx.waitForIdle();
          // Pristine copy of the worktree: diffs are measured against this snapshot
          // so applyPatch only writes what the winner changed.
          const snapshot=join(raceDir,'base');
          await cp(base,snapshot,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
          const prefill=await workspacePrefill(base);
          const jobs=RACE_ATTEMPTS.map(async(spec,i)=>{
            const dir=join(raceDir,`attempt-${i}`);
            // dereference: a symlinked source file becomes a real file in the copy,
            // so attempt edits cannot escape into the real worktree via links.
            await cp(base,dir,{recursive:true,filter:src=>!SKIP_COPY.has(basename(src)),dereference:true});
            // node_modules is shared read-mostly for speed: attempts get a link to
            // the real tree (a full copy of deps would dominate race startup).
            if(existsSync(join(base,'node_modules'))) await symlink(join(base,'node_modules'),join(dir,'node_modules'),'junction').catch(()=>{});
            const control=await createSufficeSession({...options,cwd:dir,sessionManager:undefined,continue:false,effort:'low',speed:'standard',browser:false,desktop:false,modelObject:ctx.model,extensions:[],timeout:options.timeout??600},runtime);
            controls[i]=control;
            try{
              await control.run(input+'\n\n'+prefill+(spec.hint?'\n\n'+spec.hint:''));
              const {changed,deleted}=await diffFiles(snapshot,dir);
              if(winner<0&&(changed.length||deleted.length)){
                winner=i;control.appliedChanges=changed.length+deleted.length;
                for(let j=0;j<controls.length;j++) if(j!==i) controls[j]?.abort();
              }
            }catch{ /* losing or failed attempt */ }
          });
          await Promise.allSettled(jobs);
          if(winner<0){ctx.ui.notify('Fast race: all attempts failed or produced no changes','error');return;}
          const n=await applyPatch(base,snapshot,join(raceDir,`attempt-${winner}`));
          const text=`/fast raced 3 attempts — attempt ${winner+1} finished first with ${n} applied change(s); losers aborted and discarded.`;
          pi.sendMessage({customType:'fast-race',content:text,display:true});
          ctx.ui.notify(text,'info');
        } finally {
          racing=false;
          await Promise.allSettled(controls.filter(Boolean).map(c=>c.dispose()));
          await rm(raceDir,{recursive:true,force:true});
        }
      }
    });
  };
}
