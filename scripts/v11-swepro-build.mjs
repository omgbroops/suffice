// Public runtime overlays on unchanged official task images. No acceptance files
// or reference patches enter the build context or actor image.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from '../src/v9/workspace.mjs';
import {bindImageCode} from './v11-poly27-bench.mjs';
import {runtimeFiles as commonRuntimeFiles} from './v11-poly27-build.mjs';
import {docker,save,upstreamTasks,verifiedTask,publicOrder} from './v11-swepro-prepare.mjs';
import {actorPrompt} from './v11-swepro-container-entry.mjs';

const project=resolve(import.meta.dirname,'..');
export const runtimeFiles=[...new Set([...commonRuntimeFiles,'scripts/v11-swepro-container-entry.mjs','package.json','package-lock.json'])].sort();
export function publicImageTask(task,row){
  actorPrompt(task.instruction);publicOrder([task.id]);
  if(task.id!==row.id||!row.probe?.core?.eligible||!/^[a-f0-9]{64}$/.test(row.probe.core.sourceHash)||!/^sha256:[a-f0-9]{64}$/.test(row.imageId)||!['/app','/testbed'].includes(row.probe.workspace))throw Error('Unmodified public task has not passed compatibility qualification');
  return{id:task.id,workspace:row.probe.workspace,sourceHash:row.probe.core.sourceHash,instructionSha256:hash(task.instruction)};
}
export function actorDockerfile(runtimeTag,taskTag,runtimeImage,taskImage){
  for(const tag of[runtimeTag,taskTag])if(!/^suffice-swepro-[a-z-]+:[a-f0-9]{64}$/.test(tag))throw Error('Expected local immutable-ID aliases');
  for(const image of[runtimeImage,taskImage])if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Expected immutable image IDs');
  // Preserve the image's HOME, existing PATH precedence, language dependencies,
  // source modes and Git history. Node24 runs the controller at a private path;
  // a project's existing node executable keeps its original PATH precedence.
  return`FROM ${runtimeTag} AS suffice_runtime\nFROM ${taskTag}\nUSER root\nLABEL com.suffice.runtime-image="${runtimeImage}" com.suffice.task-image="${taskImage}"\nCOPY --from=suffice_runtime /usr/local/bin/node /opt/suffice-node/bin/node\nCOPY --from=suffice_runtime /opt/codex /opt/codex\nCOPY --from=suffice_runtime /opt/suffice /opt/suffice\nCOPY runtime/ /opt/suffice/\nCOPY public-task.json /opt/suffice/swepro-task.json\nRUN rm -rf /tests /solution /logs && mkdir -p /results /home/node/.codex /opt/suffice/.suffice/pi\nRUN for repo in /app /testbed; do if [ -d "\u0024repo/.git" ]; then rm -f "\u0024repo/.git/ORIG_HEAD" "\u0024repo/.git/FETCH_HEAD" "\u0024repo/.git/MERGE_HEAD" "\u0024repo/.git/REBASE_HEAD" "\u0024repo/.git/CHERRY_PICK_HEAD" "\u0024repo/.git/BISECT_LOG"; rm -rf "\u0024repo/.git/logs" "\u0024repo/.git/hooks"; fi; done\nENV CODEX_HOME=/home/node/.codex\nENV PATH="\u0024{PATH}:/opt/suffice-node/bin:/opt/codex/codex-path"\nENTRYPOINT ["/opt/suffice-node/bin/node", "/opt/suffice/scripts/v11-swepro-container-entry.mjs"]\n`;
}
export async function buildActors(root,runtimeImage){
  root=resolve(root);if(!/^sha256:[a-f0-9]{64}$/.test(runtimeImage))throw Error('Use the immutable completed27 runtime image');
  const eligibility=JSON.parse(await readFile(join(root,'eligibility.json'),'utf8'));
  if(!eligibility.complete||eligibility.selected?.length!==8)throw Error('Eight unmodified tasks must qualify before building actor overlays');
  await bindImageCode(runtimeImage,[...commonRuntimeFiles,'package.json','package-lock.json'].sort());
  const upstream=await upstreamTasks(),results=[];
  for(const row of eligibility.selected){
    const task=await verifiedTask(upstream.upstream,row.id,upstream.expected);if(task.taskSha256!==row.taskSha256)throw Error('Qualified task assets changed');
    const directory=join(root,'actor-builds',row.id),context=join(directory,'context');await mkdir(context,{recursive:true});
    const publicTask=publicImageTask(task,row);await save(join(context,'public-task.json'),publicTask);
    for(const path of runtimeFiles){const target=join(context,'runtime',path);await mkdir(dirname(target),{recursive:true});await copyFile(join(project,path),target);}
    const runtimeTag='suffice-swepro-runtime-base:'+runtimeImage.slice(7),taskTag='suffice-swepro-task-base:'+row.imageId.slice(7);
    const dockerfile=actorDockerfile(runtimeTag,taskTag,runtimeImage,row.imageId);await writeFile(join(context,'Dockerfile'),dockerfile);
    await docker(['tag',runtimeImage,runtimeTag]);await docker(['tag',row.imageId,taskTag]);
    for(const[tag,id]of[[runtimeTag,runtimeImage],[taskTag,row.imageId]])if((await docker(['image','inspect',tag,'--format','{{.Id}}'])).stdout.trim()!==id)throw Error('Local base alias changed before building');
    const tag='suffice-v11-swepro-actor:'+hash(row.id).slice(0,24);
    await docker(['build','--network','none','--tag',tag,context],{timeoutMs:1800_000,stdoutPath:join(directory,'build-stdout.txt'),stderrPath:join(directory,'build-stderr.txt')});
    const actorImage=(await docker(['image','inspect',tag,'--format','{{.Id}}'])).stdout.trim();
    const binding=await bindImageCode(actorImage,runtimeFiles);
    const result={id:row.id,actorImage,verifierImage:row.imageId,runtimeImage,publicTask,taskSha256:task.taskSha256,taskDirectory:task.directory,instruction:task.instruction,
      publicTaskSha256:hash(await readFile(join(context,'public-task.json'))),dockerfileSha256:hash(dockerfile),binding};
    await save(join(directory,'build.json'),result);results.push(result);await save(join(root,'actor-images.json'),{at:new Date().toISOString(),complete:results.length===8,runtimeImage,tasks:results});
  }
  return{complete:results.length===8,tasks:results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)buildActors(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify({complete:r.complete,tasks:r.tasks.length}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
