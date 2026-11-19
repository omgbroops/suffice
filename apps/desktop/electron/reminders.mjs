// "Remind me" commitments: a JSON store plus a single-timer scheduler. Clock and timers are injected so tests never wait.
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX_TIMER = 2 ** 31 - 1, DEFAULT_DELAY = 3600_000; // no time given: one hour (a guess, logged in the commit)
const UNIT = {second: 1e3, sec: 1e3, minute: 6e4, min: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5};

// "remind me to call mum in 20 minutes" | "... at 5pm" | "... at 17:30" | "... tomorrow". Returns null when it is not a reminder.
export function parseReminder(input, now) {
  // Anchored at the start, and the words after "remind me" must be a connector or a time, so "can you remind me what the save button does" is a question, not a reminder.
  const m = /^\s*(?:(?:please|hey|can you|could you|would you)\s+)*remind me\s+(?=(?:to|that|about|in|after|at|tomorrow)\b)(?:(?:to|that|about)\s+)?(.*)/i.exec(String(input));
  if (!m) return null;
  let text = m[1].trim(), dueAt = null;
  const rel = /\b(?:in|after)\s+(an?|\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i.exec(text);
  const abs = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  const tomorrow = /\btomorrow\b/i.test(text);
  if (rel) {
    const n = /^an?$/i.test(rel[1]) ? 1 : Number(rel[1]);
    dueAt = now + n * UNIT[rel[2].toLowerCase().replace(/s$/, '')];
    text = text.replace(rel[0], '');
  } else if (abs) {
    let h = Number(abs[1]); const min = Number(abs[2] || 0), ap = abs[3]?.toLowerCase();
    if (min < 60 && h <= 23 && !(ap && h > 12)) {
      if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
      const d = new Date(now); d.setHours(h, min, 0, 0);
      if (tomorrow || d.getTime() <= now) d.setDate(d.getDate() + 1);
      dueAt = d.getTime(); text = text.replace(abs[0], '');
    }
  }
  if (dueAt === null && tomorrow) { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); dueAt = d.getTime(); }
  text = text.replace(/\btomorrow\b/i, '').replace(/\s+/g, ' ').replace(/[\s.,]+$/, '').trim().replace(/^(?:to|that|about)\s+/i, ''); // "in 1 hour to check" leaves a dangling "to" after the time is cut
  return {text: text || 'Reminder', dueAt: dueAt ?? now + DEFAULT_DELAY};
}

export function createReminders({file, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, notify = () => {}, onChange = () => {}}) {
  let items = [], timer = null;
  try { const parsed = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(parsed)) items = parsed.filter(r => r && typeof r.id === 'string' && typeof r.text === 'string' && Number.isFinite(r.dueAt)); } catch {}
  const save = () => { mkdirSync(dirname(file), {recursive: true, mode: 0o700}); const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(items), {mode: 0o600}); renameSync(tmp, file); };
  const arm = () => {
    if (timer !== null) clearTimer(timer); timer = null;
    const next = items.filter(r => !r.done && !r.fired).sort((a, b) => a.dueAt - b.dueAt)[0];
    if (next) timer = setTimer(tick, Math.min(MAX_TIMER, Math.max(0, next.dueAt - now())));
  };
  function tick() {
    timer = null; const t = now(); let changed = false;
    for (const r of items) if (!r.done && !r.fired && r.dueAt <= t) { r.fired = true; changed = true; try { notify(r); } catch {} }
    if (changed) { save(); onChange(); }
    arm();
  }
  return {
    list: () => items.map(r => ({...r})).sort((a, b) => a.dueAt - b.dueAt),
    add({text, dueAt, threadId = null}) {
      if (typeof text !== 'string' || !text.trim() || !Number.isFinite(dueAt)) throw new Error('Invalid reminder');
      const r = {id: randomUUID(), text: text.trim().slice(0, 500), dueAt, createdAt: now(), threadId, fired: false, done: false};
      items.push(r); save(); arm(); onChange(); return {...r};
    },
    complete(id) { const r = items.find(x => x.id === id); if (!r) return false; r.done = true; save(); arm(); onChange(); return true; },
    remove(id) { const n = items.length; items = items.filter(x => x.id !== id); if (items.length === n) return false; save(); arm(); onChange(); return true; },
    start: tick, // fires anything already due (app was closed), then arms the next timer
    stop() { if (timer !== null) clearTimer(timer); timer = null; },
  };
}
