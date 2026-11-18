import './session-state-chip.css';

// Four classifier states shown to the user. Input is the status sessions-ui derives from the backend classifier (session:<id>:state).
export const SESSION_STATE_LABELS={working:'Working',waiting:'Waiting for you',idle:'Idle',blocked:'Blocked'};
const SHORT={working:'Working',waiting:'Waiting',idle:'Idle',blocked:'Blocked'};
const FROM_STATUS={working:'working',input:'waiting',approval:'blocked',failed:'blocked',done:'idle'};
export const sessionStateKey=status=>FROM_STATUS[status]||'working';

export function paintStateChip(host,status,{tab=false}={}){
 const key=sessionStateKey(status);
 let chip=host.querySelector(':scope > .session-state-chip');
 if(!chip){chip=document.createElement('span');chip.className='session-state-chip';chip.innerHTML='<i class="session-state-mark" aria-hidden="true"></i><span class="session-state-text"></span>';chip.setAttribute('role','img');host.append(chip);}
 chip.dataset.state=key;chip.dataset.status=status;
 chip.querySelector('.session-state-text').textContent=SHORT[key];
 chip.setAttribute('aria-label',`Session state: ${SESSION_STATE_LABELS[key]}`);
 return chip;
}

// Tab at the top of a session's terminal layer; its chip follows the same state as the sidebar row.
export function paintTerminalTab(layer,label,status){
 let bar=layer.querySelector(':scope > .session-term-tabs');
 if(!bar){bar=document.createElement('div');bar.className='session-term-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Terminal');
  const tab=document.createElement('button');tab.type='button';tab.className='session-term-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','true');tab.innerHTML='<span class="session-term-name"></span>';bar.append(tab);layer.prepend(bar);}
 const tab=bar.firstElementChild;tab.querySelector('.session-term-name').textContent=label||'Terminal';
 paintStateChip(tab,status);
 tab.setAttribute('aria-label',`${label||'Terminal'}, ${SESSION_STATE_LABELS[sessionStateKey(status)]}`);
 return tab;
}
