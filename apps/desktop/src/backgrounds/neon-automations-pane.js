// Automations pane: saved prompts that run on a schedule against a project (backed by electron/automations.cjs).
import { registerPane } from './neon-panes.js';
import './neon-automations-pane.css';

const DAY = 86400000;
export const scheduleWords = s => s.kind === 'hourly' ? (s.everyHours === 1 ? 'Every hour' : `Every ${s.everyHours} hours`) : `${s.kind === 'daily' ? 'Daily' : 'Weekdays'} at ${s.at}`;
const when = (ms, now = Date.now()) => {
  const d = new Date(ms), t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  return days <= 0 ? `Today ${t}` : days === 1 ? `Tomorrow ${t}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${t}`;
};

registerPane('auto', {
  title: 'Automations',
  mount(el, { api, note, esc, ago, icons }) {
    let items = [], projects = [], models = [], editing = null, confirming = null, busy = new Set(), alive = true, timer;
    const status = i => {
      if (i.lastStatus === 'running' || busy.has(i.id)) return ['running', 'Running'];
      if (!i.lastStatus) return ['', 'Not run yet'];
      const text = `${i.lastStatus === 'ok' ? 'Succeeded' : i.lastStatus === 'error' ? 'Failed' : 'Skipped, busy'} ${Date.now() - (i.lastRunAt || Date.now()) < 60000 ? 'just now' : ago(i.lastRunAt) + ' ago'}`;
      return [i.lastStatus === 'ok' ? 'ok' : i.lastStatus === 'error' ? 'err' : 'skip', text];
    };
    const projectName = p => projects.find(x => x.path === p)?.name || p.split('/').pop();

    const row = i => {
      const [cls, label] = status(i), isConfirm = confirming === i.id;
      return `<li class="na-row${i.enabled ? '' : ' is-off'}" data-id="${esc(i.id)}">
        <button class="na-toggle" role="switch" aria-checked="${i.enabled}" aria-label="Enable ${esc(i.name)}" data-act="toggle"><span></span></button>
        <div class="na-main"><span class="na-name">${esc(i.name)}</span><span class="na-sub">${esc(projectName(i.projectPath))} · ${esc(scheduleWords(i.schedule))}</span></div>
        <div class="na-next">${i.enabled && i.nextRunAt ? `Next ${when(i.nextRunAt)}` : 'Paused'}</div>
        <div class="na-last" data-state="${cls}" title="${esc(i.lastError || '')}">${esc(label)}${i.lastThreadId ? ` <button class="na-link" data-act="thread">Open thread</button>` : ''}</div>
        <div class="na-btns">${isConfirm
          ? `<span class="na-confirm">Delete?</span><button class="na-btn na-danger" data-act="delete-yes">Delete</button><button class="na-btn" data-act="delete-no">Keep</button>`
          : `<button class="na-btn" data-act="run"${cls === 'running' ? ' disabled' : ''}>Run now</button><button class="na-btn" data-act="edit">Edit</button><button class="na-btn" data-act="delete">Delete</button>`}</div>
      </li>`;
    };

    const form = f => {
      const s = f.schedule, sel = f.model ? `${f.provider}\u0000${f.model}` : '';
      return `<form class="na-form" novalidate>
        <label>Name<input name="name" maxlength="80" value="${esc(f.name)}" placeholder="Morning dependency check"></label>
        <label>Prompt<textarea name="prompt" rows="4" placeholder="What should the agent do each time?">${esc(f.prompt)}</textarea></label>
        <div class="na-grid">
          <label>Project<select name="projectPath">${projects.length ? projects.map(p => `<option value="${esc(p.path)}"${p.path === f.projectPath ? ' selected' : ''}>${esc(p.name)}</option>`).join('') : '<option value="">No projects yet</option>'}</select></label>
          <label>Repeat<select name="kind">${[['hourly', 'Hourly'], ['daily', 'Daily'], ['weekdays', 'Weekdays']].map(([k, l]) => `<option value="${k}"${s.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="na-when" data-for="hourly">Every (hours)<input name="everyHours" type="number" min="1" max="168" value="${s.everyHours || 1}"></label>
          <label class="na-when" data-for="daily weekdays">At<input name="at" type="time" value="${esc(s.at || '09:00')}"></label>
          <label>Model<select name="model"><option value="">Default model</option>${models.map(m => `<option value="${esc(m.provider + '\u0000' + m.id)}"${sel === m.provider + '\u0000' + m.id ? ' selected' : ''}>${esc(m.name || m.id)}</option>`).join('')}</select></label>
        </div>
        <div class="na-error" role="alert" hidden></div>
        <div class="na-form-btns"><button type="submit" class="na-primary">${f.id ? 'Save changes' : 'Create automation'}</button><button type="button" class="na-btn" data-act="cancel">Cancel</button></div>
      </form>`;
    };

    const blank = () => ({ name: '', prompt: '', projectPath: projects[0]?.path || '', schedule: { kind: 'daily', at: '09:00' } });
    function render() {
      if (!alive) return;
      // keep a form being typed in: only the list region re-renders on timer ticks
      const list = el.querySelector('.na-list');
      const html = items.length ? `<ul class="na-rows">${items.map(row).join('')}</ul>` : editing ? '' : `<div class="na-empty">${icons.auto}<p>Automations run a saved prompt on a schedule against one of your projects, while Suffice is open.</p><button class="na-primary" data-act="new">New automation</button></div>`;
      if (list) { list.innerHTML = html; return; }
      el.innerHTML = `<div class="na"><div class="na-bar"><p>Saved prompts that run on a schedule while Suffice is open.</p><button class="na-primary" data-act="new">${icons.plus}<span>New automation</span></button></div><div class="na-list">${html}</div><div class="na-formhost">${editing ? form(editing) : ''}</div></div>`;
      syncWhen();
    }
    const syncWhen = () => { const f = el.querySelector('.na-form'); if (f) f.querySelectorAll('.na-when').forEach(l => { l.hidden = !l.dataset.for.split(' ').includes(f.kind.value); }); };
    const rerenderAll = () => { el.innerHTML = ''; render(); };
    const refresh = async () => { try { items = await api.automations(); } catch (e) { note(e.message); } render(); };


    const onClick = async e => {
      const b = e.target.closest('[data-act]'); if (!b || !el.contains(b)) return;
      const id = b.closest('.na-row')?.dataset.id, item = items.find(x => x.id === id), act = b.dataset.act;
      try {
        if (act === 'new') { editing = blank(); rerenderAll(); el.querySelector('[name=name]')?.focus(); }
        else if (act === 'cancel') { editing = null; rerenderAll(); }
        else if (act === 'edit') { editing = { ...item, model: item.model || '', provider: item.provider || '' }; rerenderAll(); el.querySelector('[name=name]')?.focus(); }
        else if (act === 'toggle') { await api.toggleAutomation(id, !item.enabled); await refresh(); }
        else if (act === 'run') { busy.add(id); render(); const r = await api.runAutomation(id); busy.delete(id); await refresh(); if (r.lastStatus === 'error') note(r.lastError || 'Run failed'); }
        else if (act === 'delete') { confirming = id; render(); }
        else if (act === 'delete-no') { confirming = null; render(); }
        else if (act === 'delete-yes') { confirming = null; await api.deleteAutomation(id); await refresh(); }
        else if (act === 'thread') { const t = document.querySelector(`.thread-row[data-thread="${CSS.escape(item.lastThreadId)}"]`); if (t) { document.querySelector('[data-nx="new"]')?.click(); t.click(); } else note('That thread is not in the list yet'); }
      } catch (error) { busy.delete(id); note(error.message); render(); }
    };
    const onChange = e => { if (e.target.name === 'kind') syncWhen(); };
    const onSubmit = async e => {
      e.preventDefault();
      const f = e.target, v = n => f[n].value, err = f.querySelector('.na-error');
      const schedule = v('kind') === 'hourly' ? { kind: 'hourly', everyHours: Number(v('everyHours')) } : { kind: v('kind'), at: v('at') };
      const [provider, model] = v('model') ? v('model').split('\u0000') : [undefined, undefined];
      try {
        await api.saveAutomation({ id: editing.id, name: v('name'), prompt: v('prompt'), projectPath: v('projectPath'), schedule, model, provider });
        editing = null; rerenderAll(); await refresh();
      } catch (error) { err.textContent = error.message; err.hidden = false; }
    };
    document.addEventListener('click', onClick, true); el.addEventListener('change', onChange); el.addEventListener('submit', onSubmit);

    (async () => {
      [projects, models] = await Promise.all([api.projects().catch(() => []), api.models().catch(() => [])]);
      await refresh();
      if (alive) timer = setInterval(refresh, 3000); // pane may have closed during the awaits
    })();
    return () => { alive = false; clearInterval(timer); document.removeEventListener('click', onClick, true); };
  },
});
