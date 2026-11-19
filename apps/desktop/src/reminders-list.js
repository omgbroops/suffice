// Sidebar "Reminders": commitments made with "remind me ..." in the cursor overlay. Hidden while there are none.
import './reminders-list.css';
const when = (t) => { const d = new Date(t), today = new Date(); const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === today.toDateString() ? time : d.toLocaleDateString([], { weekday: 'short' }) + ' ' + time; };
export function connectReminders({ api }) {
  const section = document.querySelector('.reminders-section'), list = section?.querySelector('.reminders-list');
  if (!section || !api?.reminders) return;
  async function render() {
    const items = (await api.reminders.list().catch(() => [])).filter((r) => !r.done);
    section.hidden = items.length === 0;
    list.replaceChildren(...items.map((r) => {
      const row = document.createElement('div'); row.className = 'reminder-row'; row.dataset.id = r.id; row.dataset.fired = String(r.fired);
      const text = document.createElement('span'); text.className = 'reminder-text'; text.textContent = r.text;
      const due = document.createElement('span'); due.className = 'reminder-due'; due.textContent = when(r.dueAt);
      const done = document.createElement('button'); done.type = 'button'; done.className = 'reminder-done'; done.textContent = 'Done'; done.setAttribute('aria-label', 'Mark reminder done: ' + r.text);
      done.addEventListener('click', () => api.reminders.complete(r.id));
      row.append(text, due, done); return row;
    }));
  }
  api.reminders.onChange(render); void render();
}
