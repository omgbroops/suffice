import {createCodingTools} from '@earendil-works/pi-coding-agent';
import {repositoryPath} from './workspace.mjs';
import {createNavigation} from './navigation.mjs';
import {createSemanticTools} from './semantic-tools.mjs';
import {implicitToolAdapter} from './implicit-tools.mjs';

export function repositoryTools({workspace, commandTimeout=180, shellPath, navigation=true, semantic=false, recipes=false, log, onDispose,autoContext=false,autoImpact=false,autoVerify=false,contextMode='semantic',packetTokens=400,contextTokens=1200}) {
  const native=createCodingTools(workspace,{bash:{shellPath,exposeSessionEnvironment:false}});
  const tools=[
    ...native.map(tool=>({...tool,label:tool.label??tool.name,
      async execute(id,args,signal,onUpdate) {
        if(tool.name!=='bash') await repositoryPath(workspace,args.path);
        else args={...args,timeout:Math.min(Math.max(args.timeout??commandTimeout,1),commandTimeout)};
        return tool.execute(id,args,signal,onUpdate);
      }
    })),
    ...(navigation?createNavigation({workspace,includeTypeScript:true,log}):[]).map(tool=>({...tool,
      async execute(id,args) {
        if(args.path) await repositoryPath(workspace,args.path);
        return tool.execute(id,args);
      }
    })),
    ...(semantic?createSemanticTools({workspace,recipes,log,onDispose}):[])
  ];
  const adapted=implicitToolAdapter({workspace,tools,context:autoContext,impact:autoImpact,verification:autoVerify,mode:contextMode,maxPacketTokens:packetTokens,maxTotalTokens:contextTokens,deferToCodemode:true,log,onDispose});
  Object.defineProperty(adapted.tools,'implicitObserver',{value:adapted.onToolResult});return adapted.tools;
}
