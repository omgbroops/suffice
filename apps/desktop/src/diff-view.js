import {icon} from './ui.js';
import {fileIcon} from './file-icons.js';
import {parseUnifiedDiff} from './panel-content.js';

// PR diff view. renderDiffView(container, {files, onReviewed}) builds a file tree (filter, status colours, sizes)
// beside stacked per-file diff cards. files = [{path, status:'A'|'M'|'D', added, removed, size, text}] with text a unified diff.
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
const KIND = {A: 'added', M: 'modified', D: 'deleted'};

// Common prefix/suffix split: the differing middle of a paired -/+ line gets the emphasis chip.
function chipRange(a, b) {
  let start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0; while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return [start, end];
}
function paint(node, text, tokens, chip) {
  const frag = document.createDocumentFragment(), runs = tokens?.length ? tokens : [{content: text}];
  let at = 0;
  for (const token of runs) {
    const pieces = chip ? [[0, chip[0]], [chip[0], text.length - chip[1]], [text.length - chip[1], text.length]] : [[0, text.length]];
    const from = at, to = at + token.content.length;
    for (const [i, [a, b]] of pieces.entries()) {
      const lo = Math.max(from, a), hi = Math.min(to, b);
      if (lo >= hi) continue;
      const span = el('span', 'syntax-token', token.content.slice(lo - from, hi - from));
      if (token.color || token.htmlStyle) { span.style.setProperty('--token-light', token.htmlStyle?.color || token.color || 'inherit'); span.style.setProperty('--token-dark', token.htmlStyle?.['--shiki-dark'] || token.color || 'inherit'); }
      if (chip && i === 1) { const mark = el('mark', 'diff-chip'); mark.append(span); frag.append(mark); } else frag.append(span);
    }
    at = to;
  }
  node.replaceChildren(frag);
}

function diffBody(file) {
  const body = el('div', 'diff-code'), rows = parseUnifiedDiff(file.text || '');
  const paintJobs = [];
  // Pair each deletion run one-to-one with the additions that follow it; the differing middle gets the chip.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'deletion' || rows[i - 1]?.kind === 'deletion') continue;
    let d = i; while (rows[d + 1]?.kind === 'deletion') d++;
    for (let n = 0; rows[i + n]?.kind === 'deletion' && rows[d + 1 + n]?.kind === 'addition'; n++) {
      const range = chipRange(rows[i + n].text, rows[d + 1 + n].text); rows[i + n]._chip = rows[d + 1 + n]._chip = range;
    }
  }
  let prevEnd = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === 'hunk') {
      const start = Number(row.text.match(/\+(\d+)/)?.[1] || 1), gap = start - prevEnd - 1;
      if (gap <= 0 && !row.text.replace(/^@@.*?@@\s*/, '')) { continue; }
      const sep = el('div', 'diff-sep'); sep.insertAdjacentHTML('beforeend', icon('chevron', 'diff-sep-chevron'));
      sep.append(el('span', '', gap > 0 ? `${gap} unmodified line${gap === 1 ? '' : 's'}` : row.text.replace(/^@@.*?@@\s*/, '')));
      body.append(sep); continue;
    }
    if (row.new) prevEnd = row.new;
    const line = el('div', `diff-line diff-${row.kind}`);
    line.append(el('span', 'diff-num', row.old ?? ''), el('span', 'diff-num', row.new ?? ''));
    const code = el('code', 'diff-text', row.text || ' '); line.append(code);
    const chip = row._chip && row._chip[0] + row._chip[1] < row.text.length ? row._chip : null;
    paintJobs.push({code, row, chip}); body.append(line);
  }
  if (!rows.length) body.append(el('p', 'diff-empty', 'No text diff'));
  if (paintJobs.length) {
    for (const {code, row, chip} of paintJobs) paint(code, row.text, null, chip);
    void import('./code-highlight.js').then(async ({highlightLines}) => {
      const tokens = await highlightLines(paintJobs.map(({row}) => row.text).join('\n'), file.path);
      if (body.isConnected) paintJobs.forEach(({code, row, chip}, index) => paint(code, row.text, tokens[index], chip));
    }).catch(() => {});
  }
  return body;
}

function card(file, onReviewed) {
  const root = el('article', 'diff-card'); root.id = 'diff-' + file.path.replace(/\W+/g, '-'); root.dataset.path = file.path;
  const head = el('header', 'diff-head');
  const toggle = el('button', 'diff-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Collapse ' + file.path);
  toggle.insertAdjacentHTML('beforeend', icon('chevron', 'diff-chevron'));
  const slash = file.path.lastIndexOf('/');
  toggle.append(fileIcon(file.path), el('span', 'diff-name', file.path.slice(slash + 1)), el('span', 'diff-dir', slash < 0 ? '' : file.path.slice(0, slash + 1)));
  const counts = el('span', 'diff-counts');
  if (file.added) counts.append(el('span', 'diff-added', '+' + file.added));
  if (file.removed) counts.append(el('span', 'diff-removed', '−' + file.removed));
  const label = el('label', 'diff-reviewed'), box = el('input'); box.type = 'checkbox';
  label.append(el('span', '', 'Reviewed'), box);
  box.addEventListener('change', () => { root.dataset.reviewed = String(box.checked); onReviewed?.(file.path, box.checked); });
  head.append(toggle, counts, label);
  const body = diffBody(file);
  toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); body.hidden = !open; });
  root.append(head, body);
  return root;
}

function tree(files, onPick) {
  const root = el('nav', 'diff-tree'); root.setAttribute('aria-label', 'Changed files');
  const head = el('div', 'diff-tree-head'); head.append(el('span', '', 'Files'), el('span', 'diff-tree-count', String(files.length)));
  const field = el('label', 'diff-filter'); field.insertAdjacentHTML('beforeend', icon('search'));
  const input = el('input'); input.type = 'search'; input.placeholder = 'Filter files'; input.setAttribute('aria-label', 'Filter files'); field.append(input);
  const list = el('div', 'diff-tree-list'); list.setAttribute('role', 'list');
  const groups = new Map();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    if (!groups.has(dir)) groups.set(dir, []); groups.get(dir).push(file);
  }
  const rows = [];
  for (const [dir, items] of groups) {
    if (dir) { const h = el('div', 'diff-tree-dir', dir.split('/').join(' / ')); h.dataset.dir = dir; list.append(h); }
    for (const file of items) {
      const row = el('button', 'diff-tree-row'); row.type = 'button'; row.dataset.kind = KIND[file.status] || 'modified'; row.dataset.path = file.path; row.dataset.nested = String(!!dir);
      row.append(fileIcon(file.path), el('span', 'diff-tree-name', file.path.split('/').pop()));
      if (file.size) row.append(el('span', 'diff-tree-size', file.size));
      const c = el('span', 'diff-tree-counts'); if (file.added) c.append(el('span', 'diff-added', '+' + file.added)); if (file.removed) c.append(el('span', 'diff-removed', '−' + file.removed));
      row.append(c, el('span', 'diff-tree-status', file.status || 'M'));
      row.addEventListener('click', () => onPick(file.path));
      list.append(row); rows.push(row);
    }
  }
  input.addEventListener('input', () => {
    const needle = input.value.trim().toLowerCase();
    rows.forEach(r => { r.hidden = !!needle && !r.dataset.path.toLowerCase().includes(needle); });
    list.querySelectorAll('.diff-tree-dir').forEach(h => { h.hidden = !rows.some(r => !r.hidden && r.dataset.path.startsWith(h.dataset.dir + '/')); });
  });
  root.append(head, field, list);
  return root;
}

export function renderDiffView(container, {files = [], onReviewed} = {}) {
  const root = el('div', 'diff-view'), stack = el('div', 'diff-stack');
  const cards = files.map(file => card(file, onReviewed));
  stack.append(...cards);
  root.append(tree(files, path => { const target = cards.find(c => c.dataset.path === path); target?.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }), stack);
  container.append(root);
  return {root, destroy: () => root.remove()};
}
