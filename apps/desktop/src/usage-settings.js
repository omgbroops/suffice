const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>value>=1?'$'+value.toFixed(2):value>0?'$'+value.toFixed(value<.01?4:3):'$0.00';
export const compact=value=>value>=1e6?(value/1e6).toFixed(value>=1e7?0:1)+'M':value>=1e3?(value/1e3).toFixed(value>=1e5?0:1)+'K':String(Math.round(value));
export const percent=value=>value===null?'n/a':Math.round(value*100)+'%';
const dayLabel=day=>new Date(day+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});

// Last `count` calendar days ending today, zero-filled, so a quiet day is a visible gap.
export function lastDays(days,count,today=new Date()){
 const byDay=new Map(days.map(item=>[item.day,item])),out=[];
 for(let i=count-1;i>=0;i--){const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-i,12),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;out.push(byDay.get(key)||{day:key,cost:0,tokens:0,turns:0,cacheHit:null});}
 return out;
}

export function mountUsageSettings(content,section,api){
 if(section!=='usage')return;
 const host=content.querySelector('#settings-title-usage')?.closest('.settings-section');if(!host)return;
 const view=document.createElement('div');view.className='usage-view';host.querySelector('.settings-title-row').after(view);
 view.innerHTML='<p class="usage-status" role="status">Reading saved threads…</p>';
 api.usageReport().then(report=>{
  if(!view.isConnected)return;
  if(!report.total.turns){view.innerHTML='<p class="usage-status" role="status">No usage yet. Run a task and its tokens and cost appear here.</p>';return;}
  const days=lastDays(report.days,14),max=Math.max(...days.map(item=>item.cost),1e-9),t=report.total;
  const tile=(label,value)=>`<div class="usage-tile"><span>${label}</span><strong>${esc(value)}</strong></div>`;
  view.innerHTML=`<div class="usage-tiles" role="group" aria-label="All time totals">${tile('Cost',money(t.cost))}${tile('Tokens',compact(t.tokens))}${tile('Cache hit',percent(t.cacheHit))}${tile('Turns',String(t.turns))}</div>
  <section class="settings-group" aria-label="By day"><h2>By day</h2><div class="settings-card usage-chart-card"><div class="usage-bars" role="img" aria-label="Cost per day, last 14 days">${days.map(item=>`<span class="usage-bar" data-day="${item.day}" title="${esc(dayLabel(item.day))}: ${money(item.cost)}, ${compact(item.tokens)} tokens, ${percent(item.cacheHit)} cache hit"><i style="height:${item.cost?Math.max(4,item.cost/max*100):0}%"></i></span>`).join('')}</div><div class="usage-axis"><span>${esc(dayLabel(days[0].day))}</span><span>${esc(dayLabel(days.at(-1).day))}</span></div></div></section>
  <section class="settings-group" aria-label="By thread"><h2>By thread</h2><div class="settings-card usage-threads">${report.threads.slice(0,8).map(item=>`<div class="settings-option usage-thread" data-thread="${esc(item.id)}"><div class="settings-option-copy"><div><span class="settings-option-label">${esc(item.title)}</span><p>${item.turns} turns · ${compact(item.tokens)} tokens · ${percent(item.cacheHit)} cache hit${item.model?' · '+esc(item.model):''}</p></div></div><span class="usage-cost">${money(item.cost)}</span></div>`).join('')}</div></section>`;
 }).catch(()=>{if(view.isConnected)view.innerHTML='<p class="usage-status" role="status">Could not read usage.</p>';});
}
