import {createCodingTools} from '@earendil-works/pi-coding-agent';
import {repositoryPath} from './workspace.mjs';
import {createNavigation} from './navigation.mjs';

const NATIVE_BY_ACCESS={
  read:['read'],
  edit:['read','edit','write'],
  full:['read','bash','edit','write'],
};

export function repositoryTools({workspace, commandTimeout=180, shellPath, access='full'}) {
  if(!Object.hasOwn(NATIVE_BY_ACCESS,access)) throw new Error(`Unknown access level: ${access}`);
  const allowed=NATIVE_BY_ACCESS[access];
  const native=createCodingTools(workspace,{bash:{shellPath,exposeSessionEnvironment:false}}).filter(tool=>allowed.includes(tool.name));
  return [
    ...native.map(tool=>({...tool,label:tool.label??tool.name,
      async execute(id,args,signal,onUpdate) {
        if(tool.name!=='bash') await repositoryPath(workspace,args.path);
        else args={...args,timeout:Math.min(Math.max(args.timeout??commandTimeout,1),commandTimeout)};
        return tool.execute(id,args,signal,onUpdate);
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
