import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {InteractiveMode,createAgentSessionRuntime,SessionManager} from '@earendil-works/pi-coding-agent';
import {createSufficeSession} from './session.mjs';
import {recentProjects,rememberProject,resolveProject} from './projects.mjs';
import {hash} from './workspace.mjs';
import {VERSION} from './options.mjs';

// Small presentation overrides for the pinned Pi 1.2.0 interface. Leave its
// editor, renderers, commands, helper downloads and model access unchanged.
export class SufficeInteractiveMode extends InteractiveMode {
  updateTerminalTitle() {
    if(this.ui) this.ui.terminal.setTitle(`Suffice · ${basename(this.runtimeHost.cwd)}`);
  }
  showNewVersionNotification() { /* Updates are delivered by Suffice's repository. */ }
}

export function sufficeInterface(options) {
  return pi=>{
    pi.on('session_start',(_event,ctx)=>{
      if(ctx.mode!=='tui') return;
      ctx.ui.setHeader((_tui,theme)=>({
        render:()=>[
          theme.fg('accent',theme.bold(`Suffice ${VERSION}`)),
          theme.fg('muted','Pi interface and engine · Suffice tools and codemode'),
          theme.fg('dim','/project choose a project · /login sign in · /model choose model'),
          theme.fg('dim','/settings preferences · /resume sessions · Ctrl+C interrupt'),
        ],invalidate(){}
      }));
      ctx.ui.setTitle(`Suffice · ${ctx.cwd}`);
      ctx.ui.setStatus('suffice','Suffice');
    });
    const project=async(args,ctx)=>{
      try {
        await ctx.waitForIdle();
        let input=args.trim();
        if(!input) {
          const recents=await recentProjects(options.home);
          const other='Choose another directory…';
          const selected=await ctx.ui.select('Choose project',[other,...recents]);
          if(!selected) return;
          input=selected===other?await ctx.ui.input('Project directory',ctx.cwd):selected;
          if(!input) return;
        }
        const cwd=await resolveProject(input,ctx.cwd),dir=resolve(options.home,'sessions',hash(cwd).slice(0,20));
        await mkdir(dir,{recursive:true,mode:0o700});
        // A valid empty Pi session lets its normal switch flow recreate cwd-bound
        // tools, resources, UI and history together. No synthetic user message.
        const target=SessionManager.create(cwd,dir),path=target.getSessionFile();
        await writeFile(path,JSON.stringify(target.getHeader())+'\n',{flag:'wx',mode:0o600});
        const result=await ctx.switchSession(path);
        if(!result.cancelled) await rememberProject(options.home,cwd);
      } catch(e) {ctx.ui.notify(`Cannot open project: ${e.message}`,'error');}
    };
    pi.registerCommand('project',{description:'Choose or switch project directories',handler:project});
    pi.registerCommand('cd',{description:'Switch project directory',handler:project});
    pi.registerCommand('usage',{description:'Show inference usage for this session',handler:async(_args,ctx)=>{
      const usage=options.getUsage?.();
      ctx.ui.notify(usage?`${usage.modelCalls} model calls · API-equivalent ${usage.costUnknown?'at least ':''}$${usage.estimatedApiUsd.toFixed(4)}`:'No inference usage yet','info');
    }});
  };
}

export async function runInteractive(options,runtime) {
  const controls=[];let host;
  const factory=async({cwd,sessionManager})=>{
    let control;
    control=await createSufficeSession({...options,cwd,sessionManager,modelObject:host?.session.model,effort:host?.session.thinkingLevel??options.effort,deferBindings:true,extensions:[sufficeInterface({...options,getUsage:()=>control?.totals})]},runtime);
    controls.push(control);
    // Native quit exits the process after session_shutdown; flush durable receipts
    // in the shutdown event rather than relying only on a surrounding finally.
    return {...control.created,services:control.services,diagnostics:[]};
  };
  const sessionDir=resolve(options.home,'sessions',hash(options.cwd).slice(0,20));
  await mkdir(sessionDir,{recursive:true,mode:0o700});
  const manager=options.continue?SessionManager.continueRecent(options.cwd,sessionDir):SessionManager.create(options.cwd,sessionDir);
  host=await createAgentSessionRuntime(factory,{cwd:options.cwd,agentDir:options.home,sessionManager:manager});
  await rememberProject(options.home,options.cwd);
  const ui=new SufficeInteractiveMode(host,{initialMessage:options.prompt||undefined});
  try {await ui.run();}
  finally {await host.dispose();for(const c of controls) await c.flush();}
}
