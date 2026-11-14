import {createCodingTools,createPowerShellTool} from '@earendil-works/pi-coding-agent';
import {repositoryPath} from './workspace.mjs';
import {createNavigation} from './navigation.mjs';
import {nativeShellPath} from './shell.mjs';

export function repositoryTools({workspace, commandTimeout=180, shellPath, preferredShell, toolObserver}) {
  let native=createCodingTools(workspace,{bash:{shellPath:nativeShellPath(shellPath),exposeSessionEnvironment:false}});if(preferredShell==='PowerShell'&&process.platform==='win32')native=[...native.filter(tool=>!['bash','powershell'].includes(tool.name)),createPowerShellTool(workspace,{exposeSessionEnvironment:false})];
  return [
    ...native.map(tool=>({...tool,label:tool.label??tool.name,
      async execute(id,args,signal,onUpdate) {
        if(!['bash','powershell'].includes(tool.name)) await repositoryPath(workspace,args.path);
        else args={...args,timeout:Math.min(Math.max(args.timeout??commandTimeout,1),commandTimeout)};
        // Optional product instrumentation sees nested codemode calls as well.
        let observation;
        try { observation=await toolObserver?.before(tool.name,args); } catch {}
        try { return await tool.execute(id,args,signal,onUpdate); }
        finally { try { await toolObserver?.after(observation); } catch {} }
      }
    })),
    ...createNavigation({workspace,includeTypeScript:true}).map(tool=>({...tool,
      async execute(id,args) {
        if(args.path) await repositoryPath(workspace,args.path);
        return tool.execute(id,args);
      }
    }))
  ];
}
