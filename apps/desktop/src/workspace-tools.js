import {icon} from './ui.js';
import {setupPanelResize} from './sidebar-resize.js';
import {threadViewState as viewState} from './thread-view-state.js';
import {connectRightPanel} from './right-panel.js';
export function connectWorkspaceTools(api){
  const app=document.querySelector('#app');
  const tools=document.createElement('div');tools.className='workspace-tools sidebar-tools';
  const ring=document.createElement('button');ring.type='button';ring.className='button button--ghost workspace-tool context-ring';ring.setAttribute('aria-label','Context usage');ring.dataset.richTooltip='true';ring.setAttribute('aria-expanded','false');ring.setAttribute('aria-describedby','context-usage-details');
  ring.innerHTML='<svg class="icon" width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle class="context-ring-track" cx="10" cy="10" r="7"/><circle class="context-ring-value" cx="10" cy="10" r="7" pathLength="100"/></svg>';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='button button--ghost workspace-tool';toggle.setAttribute('aria-label','Toggle right panel');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','right-sidebar');
  toggle.innerHTML=icon('panel');
  const sidebar=document.createElement('aside');sidebar.id='right-sidebar';sidebar.className='right-sidebar';sidebar.setAttribute('aria-label','Right panel');sidebar.inert=true;sidebar.setAttribute('aria-hidden','true');app.append(sidebar);
  const resize=document.createElement('div');resize.className='sidebar-resizer right-sidebar-resizer';resize.setAttribute('role','separator');resize.tabIndex=0;resize.setAttribute('aria-label','Resize right panel');resize.setAttribute('aria-orientation','vertical');resize.setAttribute('aria-controls',sidebar.id);resize.setAttribute('aria-valuemin','360');resize.setAttribute('aria-valuemax','960');sidebar.append(resize);
  setupPanelResize({handle:resize,panel:sidebar,property:'--right-panel-width',key:'suffice-right-panel-width',side:'right',minimum:360,maximum:()=>Math.min(960,Math.max(260,innerWidth-document.querySelector('.sidebar').getBoundingClientRect().width-376))});
  connectRightPanel({sidebar,resize,toggle,api});
  const details=document.createElement('div');details.id='context-usage-details';details.className='context-usage-details';details.setAttribute('role','tooltip');details.hidden=true;
  const labels=['Cost','Window (est.)','Window tokens (est.)','Session total tokens'];
  const values=labels.map(label=>{const row=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.textContent='–';row.append(name,value);details.append(row);return value;});
  const format=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
  function update(usage){const valid=value=>Number.isFinite(value);const percent=usage?.windowPercent;
    ring.style.setProperty('--context-percent',valid(percent)?Math.min(100,Math.max(0,percent)):0);
    ring.dataset.level=percent>=90?'critical':percent>=75?'warning':'normal';
    ring.setAttribute('aria-label',valid(percent)?`Context usage: ${Math.round(percent)}%`:'Context usage');
    values[0].textContent=valid(usage?.cost)?new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(usage.cost):'–';
    values[1].textContent=valid(percent)?`${Math.round(percent)}%`:'–';
    values[2].textContent=valid(usage?.windowTokens)?format.format(usage.windowTokens):'–';
    values[3].textContent=valid(usage?.totalTokens)?format.format(usage.totalTokens):'–';
  }
  let revision=0;
  async function refresh(){const version=++revision;try{const usage=await api.usage(viewState.id);if(version===revision)update(usage);}catch{/* Keep the last receipt if the harness is restarting. */}}
  function position(){const r=ring.getBoundingClientRect();details.style.top=`${r.bottom+7}px`;details.style.left=`${Math.max(8,Math.min(r.right-details.offsetWidth,innerWidth-details.offsetWidth-8))}px`;}
  let delay;
  function hide(){clearTimeout(delay);details.hidden=true;ring.setAttribute('aria-expanded','false');}
  function show(){clearTimeout(delay);void refresh();delay=setTimeout(()=>{details.hidden=false;ring.setAttribute('aria-expanded','true');position();},300);}
  ring.addEventListener('click',()=>{if(details.hidden)show();else hide();});
  document.addEventListener('pointerdown',event=>{if(!ring.contains(event.target))hide();});
  ring.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')show();});ring.addEventListener('pointerleave',hide);ring.addEventListener('focus',show);ring.addEventListener('blur',hide);ring.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  window.addEventListener('resize',()=>{if(!details.hidden)position();});
  api.onEvent(event=>{if(event.event==='usage'&&(!event.threadId||event.threadId===viewState.id)){revision++;update(event.usage);}});
  document.addEventListener('suffice:usage-change',()=>void refresh());
  tools.hidden=!viewState.id;
  viewState.subscribe(event=>{if(event.type==='select'||event.type==='adopt'){tools.hidden=!event.id;hide();}});
  tools.append(ring,toggle);document.body.append(tools,details);void refresh();
}
