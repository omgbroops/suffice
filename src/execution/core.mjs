// Model-independent capabilities shared by Flexible and Efficient execution.
// The original interactive/V1 session remains a byte-identical control.
import {preparePipelineInput, createNoticeExtension} from '../pipeline/preparation.mjs';
import {createObservedRepositoryTools} from '../pipeline/tools.mjs';
import {resolve} from 'node:path';
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";

export async function prepareExecutionInput(request, workspace, runDir, label) {
  const f=request.features;
  if (!(f.preparedContext || f.guidance || f.runbooks)) return request.prompt;
  return (await preparePipelineInput({workspace,prompt:request.prompt,runDir:resolve(runDir,'inputs-'+label),features:f,
    context:{paths:request.contextPaths,contracts:request.contracts??[],guidance:request.guidance??[],
      commands:Object.fromEntries(request.checks.map((c,i)=>[`check-${i+1}`,c.command.map(quote).join(' ')]))},
    runbooks:request.runbooks??[]})).prompt;
}

export function executionNotices({workspace,enabled,record}) {
  return enabled ? [createNoticeExtension({workspace,record})] : [];
}

export async function withExecutionOutput(options,{workspace,artifactDir,enabled,record}) {
  if (!enabled) return options;
  const observed=await createObservedRepositoryTools({workspace,artifactDir,shellPath:options.shellPath,record});
  return {...options,tools:observed.tools,extensions:[options.extensions[0],observed.extension,...options.extensions.slice(1)]};
}
