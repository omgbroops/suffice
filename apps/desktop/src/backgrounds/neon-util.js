// Small helpers shared by the neon files.
export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// "3 days ago" text from Suffice's row labels, as 3d
export const shortTime = t => { const m = /(\d+)\s*(day|week|month|hour|minute)/.exec(t || ''); if (m) return m[1] + m[2][0].replace('m', m[2] === 'month' ? 'mo' : 'm');
  return /last month/.test(t) ? '1mo' : /yesterday/.test(t) ? '1d' : /last week/.test(t) ? '1w' : ''; };

export const ago = ms => { const m = Math.max(0, (Date.now() - ms) / 60000); return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 10080 ? `${Math.round(m / 1440)}d` : m < 43200 ? `${Math.round(m / 10080)}w` : `${Math.round(m / 43200)}mo`; };

const toasts = new Map();
export function note(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text; document.body.append(t);
  toasts.set(t, setTimeout(() => { toasts.delete(t); t.remove(); }, 3200));
}
export function clearNotes() { for (const [t, id] of toasts) { clearTimeout(id); t.remove(); } toasts.clear(); }

// state as the GitHub API sends it (OPEN) to the lowercase form the CSS and labels use
export const stateOf = x => String(x?.state || '').toLowerCase();
// issue/PR search: number and title, case-insensitive; an empty query matches everything
export const matchesQuery = (x, q) => !q || `${x.number} ${x.title}`.toLowerCase().includes(q.toLowerCase());
