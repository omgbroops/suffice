import {createCodingTools,createLocalBashOperations} from '@earendil-works/pi-coding-agent';
import {repositoryPath} from '../../packages/cli/src/workspace.mjs';
import {createNavigation} from '../../packages/cli/src/navigation.mjs';
import {createObservationController} from './observations.mjs';

export async function createObservedRepositoryTools({workspace,artifactDir,shellPath,commandTimeout=180,record=()=>{}}) {
  const observation=createObservationController({workspace,artifactDir});
  const native=createCodingTools(workspace,{bash:{shellPath,exposeSessionEnvironment:false,operations:observation.wrapBashOperations(createLocalBashOperations({shellPath}))}});
  const tools=[...observation.wrapTools(native),...createNavigation({workspace,includeTypeScript:true})].map(tool=>({...tool,label:tool.label??tool.name,
    async execute(id,args,signal,onUpdate) {
      if(tool.name==='bash')args={...args,timeout:Math.min(Math.max(args.timeout??commandTimeout,.01),commandTimeout)};
      else if(args.path)await repositoryPath(workspace,args.path);
      return tool.execute(id,args,signal,onUpdate);
    }}));
  tools.push(observation.readTool);
  const extension=pi=>pi.on('tool_result',async e=>{
    if(e.toolName!=='codemode')return;
    const presented=await observation.presentResult(e,{kind:'codemode'});
    if(presented!==e){record({kind:'output_control',tool:e.toolName,observation:presented.details?.observation});return {content:presented.content,details:presented.details};}
  });
  return {tools,extension,observation};
}
