// Settings > Projects & Git > Worktrees: size, age, pinned; pin, delete (snapshots first), restore.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=b=>b>=1e9?(b/1e9).toFixed(1)+' GB':b>=1e6?Math.round(b/1e6)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
const age=ms=>ms>=864e5?Math.floor(ms/864e5)+'d':ms>=36e5?Math.floor(ms/36e5)+'h':Math.max(1,Math.floor(ms/6e4))+'m';
export function mountWorktreesSettings(content,section,api){
 if(section!=='projects'||!api.worktreesList)return;
 const host=content.querySelector('#settings-title-projects')?.closest('.settings-section');if(!host||host.querySelector('[data-worktrees]'))return;
 const group=document.createElement('section');group.className='settings-group';group.dataset.worktrees='';group.setAttribute('aria-label','Worktrees');
 group.innerHTML='<h2>Worktrees</h2><div class="settings-card wt-card" role="list"></div>';host.append(group);
 const card=group.querySelector('.wt-card');
 const draw=async()=>{
  const rows=await api.worktreesList();
  card.innerHTML=rows.length?rows.map(r=>`<div class="settings-option wt-row" role="listitem" data-id="${esc(r.id)}"><div class="settings-option-copy"><div><span class="settings-option-label">${esc(r.repo.split('/').pop())} · ${esc(r.id)}</span><p>${r.gone?'Deleted, snapshot kept':size(r.size)+' · '+age(r.ageMs)+(r.changed?' · changes':'')}</p></div></div><div class="wt-actions">${r.gone?'<button class="button" data-act="restore">Restore</button>':`<button class="button" data-act="pin" aria-pressed="${!!r.pinned}">${r.pinned?'Unpin':'Pin'}</button><button class="button" data-act="remove">Delete</button>`}</div></div>`).join(''):'<div class="settings-option"><p>No worktrees</p></div>';
 };
 card.addEventListener('click',async e=>{
  const b=e.target.closest('button[data-act]');if(!b)return;const row=b.closest('[data-id]'),act=b.dataset.act;
  try{await api.worktreesAction({action:act,id:row.dataset.id,pinned:b.getAttribute('aria-pressed')!=='true'});await draw();}catch{}
 });
 draw().catch(()=>{card.innerHTML='<div class="settings-option"><p>Could not read worktrees</p></div>';});
}
