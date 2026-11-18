import {compact} from './usage-settings.js';
const field=(name,label,note,value)=>`<div class="settings-option"><div class="settings-option-copy"><div><label class="settings-option-label" for="budget-${name}">${label}</label><p>${note}</p></div></div><input id="budget-${name}" name="${name}" class="budget-input" type="number" min="0" step="1" inputmode="numeric" placeholder="No cap" value="${value||''}"></div>`;
// Settings > Usage: weekly and per-run token caps, enforced by the backend budget in the worker.
export function mountBudgetSettings(host,api){
 const draw=async state=>{
  state??=await api.budgetGet();const {caps,weekly}=state;
  host.innerHTML=`<section class="settings-group" aria-label="Spend caps"><h2>Spend caps</h2><form class="settings-card budget-form">${field('weeklyTokens','Weekly cap','Tokens per week. Turns stop starting once it is spent.',caps.weeklyTokens)}${field('runTokens','Per-run cap','Tokens in one run. The run stops when it passes this.',caps.runTokens)}<div class="settings-option budget-foot"><span class="budget-status" role="status">${weekly?`${compact(weekly.used)} of ${compact(weekly.ceiling)} used this week`:'No weekly cap set'}</span><button type="submit" class="budget-save">Save caps</button></div></form></section>`;
  host.querySelector('form').addEventListener('submit',async e=>{
   e.preventDefault();const f=new FormData(e.target),num=k=>Number(f.get(k)||0),out=host.querySelector('.budget-status');
   try{await draw(await api.budgetSet({weeklyTokens:num('weeklyTokens'),runTokens:num('runTokens')}));host.querySelector('.budget-status').textContent+=' · Saved';}
   catch(err){out.textContent='Could not save: '+err.message.replace(/^Error invoking remote method '[^']*': (Error: )?/,'');}
  });
 };
 draw().catch(()=>{host.innerHTML='<p class="usage-status" role="status">Could not read caps.</p>';});
}
