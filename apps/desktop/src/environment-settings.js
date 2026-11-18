// Settings > Projects & Git > Environment: the setup script run in a project's worktrees before the first task.
export function mountEnvironmentSettings(content,section,api){
 if(section!=='projects'||!api.environment)return;
 const host=content.querySelector('#settings-title-projects')?.closest('.settings-section');if(!host||host.querySelector('[data-environment]'))return;
 const group=document.createElement('section');group.className='settings-group';group.dataset.environment='';group.setAttribute('aria-label','Environment');
 group.innerHTML='<h2>Environment</h2><div class="settings-card env-card"><label class="resource-field"><span class="env-label">Setup script</span><textarea id="env-script" rows="4" spellcheck="false" placeholder="bun install"></textarea></label><div class="env-foot"><p class="env-note" role="status"></p><button type="button" class="settings-select settings-configure">Save</button></div></div>';
 host.append(group);
 const area=group.querySelector('textarea'),note=group.querySelector('.env-note'),save=group.querySelector('button');
 const when=at=>at?'Last run '+new Date(at).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'Not run yet';
 let edited=false;area.addEventListener('input',()=>{edited=true;});
 const show=data=>{if(!edited)area.value=data.script;note.textContent=data.name+' · Runs in new worktrees and before a task starts. Skipped when lockfiles are unchanged. '+when(data.lastRun);};
 api.environment().then(show).catch(()=>{area.disabled=save.disabled=true;note.textContent='Choose a project to edit its environment.';});
 save.onclick=async()=>{save.disabled=true;try{show(await api.environment({script:area.value}));note.textContent='Saved. '+note.textContent;}catch(error){note.textContent=error.message?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')||'Could not save';}finally{save.disabled=false;}};
}
