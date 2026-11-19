const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={anthropic:'Anthropic',openai:'OpenAI',openrouter:'OpenRouter','openai-compatible':'OpenAI-compatible'};
const clean=err=>err.message.replace(/^Error invoking remote method '[^']*': (Error: )?/,'');
// The base URL is not secret; the backend binds the key to its origin and needs the URL again on test, so it is remembered here.
const baseKey='suffice-keys-base';
const savedBase=()=>{try{return localStorage.getItem(baseKey)||'';}catch{return '';}};
const saveBase=v=>{try{localStorage.setItem(baseKey,v);}catch{}};
// Settings > Models: bring-your-own API keys. The key goes to the backend vault and never comes back; rows show the last 4 characters only.
export function mountKeysSettings(content,section,api){
 if(section!=='providers'||!api.keys)return;
 const host=content.querySelector('#settings-title-providers')?.closest('.settings-section');if(!host)return;
 const box=document.createElement('div');box.className='keys-view';(host.querySelector('.settings-subtitle')||host.querySelector('.settings-title-row')).after(box);
 const draw=async note=>{
  const state=await api.keys.list(),{locked,keys,providers}=state;
  const rows=providers.filter(p=>keys[p]).map(p=>`<div class="settings-option keys-row" data-key-provider="${p}"><div class="settings-option-copy"><div><span class="settings-option-label">${names[p]}</span><p>Saved <code>${esc(keys[p])}</code></p></div></div><span class="keys-result" role="status" data-for="${p}"></span><button type="button" class="settings-select" data-key-test="${p}"${locked?' disabled':''}>Test</button><button type="button" class="settings-select" data-key-remove="${p}">Remove</button></div>`).join('');
  box.innerHTML=`<section class="settings-group" aria-label="API keys"><h2>API keys</h2><div class="settings-card keys-card"><div class="settings-option keys-lock" data-locked="${locked}"><span class="keys-state" role="status">${locked?'Vault locked: '+esc(state.reason):'Vault unlocked. Keys are encrypted on this Mac.'}</span></div>${rows}<form class="settings-option keys-form" novalidate><select class="budget-input keys-provider" name="provider" aria-label="Provider"${locked?' disabled':''}>${providers.map(p=>`<option value="${p}">${names[p]}</option>`).join('')}</select><input class="budget-input keys-key" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="API key" aria-label="API key"${locked?' disabled':''}><input class="budget-input keys-base" name="baseUrl" type="url" placeholder="Base URL" aria-label="Base URL" hidden><button type="submit" class="budget-save"${locked?' disabled':''}>Add key</button></form><div class="settings-option budget-foot" ${note?'':'hidden'}><span class="budget-status keys-note" role="status">${esc(note||'')}</span></div></div></section>`;
  const form=box.querySelector('form'),sel=form.provider,base=form.baseUrl,note_=box.querySelector('.keys-note');
  const show=t=>{note_.textContent=t;note_.parentElement.hidden=false;};
  const baseFor=p=>p==='openai-compatible'?form.baseUrl.value.trim()||savedBase():'';
  sel.addEventListener('change',()=>{base.hidden=sel.value!=='openai-compatible';});
  form.addEventListener('submit',async e=>{e.preventDefault();const p=sel.value,key=form.key.value;if(!key.trim()){show('Paste a key first');return;}if(p==='openai-compatible'&&!baseFor(p)){show('Enter a Base URL for OpenAI-compatible keys');return;}
   try{await api.keys.set({provider:p,key,baseUrl:baseFor(p)||undefined});if(p==='openai-compatible')saveBase(baseFor(p));form.key.value='';await draw(`${names[p]} key saved`);}catch(err){show('Could not save: '+clean(err));}});
  for(const b of box.querySelectorAll('[data-key-test]'))b.addEventListener('click',async()=>{const p=b.dataset.keyTest,out=box.querySelector(`.keys-result[data-for="${p}"]`);b.disabled=true;out.textContent='Testing…';
   try{const r=await api.keys.test({provider:p,baseUrl:baseFor(p)||undefined});out.textContent=r.ok?'Key works':'Failed: '+r.error;out.dataset.ok=String(!!r.ok);}catch(err){out.textContent='Failed: '+clean(err);}b.disabled=false;});
  for(const b of box.querySelectorAll('[data-key-remove]'))b.addEventListener('click',async()=>{await api.keys.remove({provider:b.dataset.keyRemove});await draw(`${names[b.dataset.keyRemove]} key removed`);});
 };
 draw().catch(()=>{box.innerHTML='<p class="usage-status" role="status">Could not read keys.</p>';});
}
