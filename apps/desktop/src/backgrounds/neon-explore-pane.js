// Explore pane: file tree (lazy), file viewer (README as markdown), branches and recent commits of the selected project.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { registerPane } from './neon-panes.js';
import './neon-panes-te.css';

registerPane('explore', {
  title: 'Explore',
  mount(el, { api, esc, icons: I, actions, fillComposer }) {
    el.innerHTML = '<div class="te-empty">Loading…</div>';
    let alive = true, selected = '';
    const bar = actions;
    (async () => {
      let root;
      try { root = await api.files(''); } catch { root = null; }
      if (!alive) return;
      if (!root) {
        el.innerHTML = `<div class="te-empty te-big">${I.folder}<p>No project selected.</p><button type="button" class="te-btn" data-pick>Choose a project</button></div>`;
        el.querySelector('[data-pick]').onclick = () => document.querySelector('.project-picker')?.click();
        return;
      }
      bar.innerHTML = `<button type="button" class="te-btn" data-view="tree">${I.folder}Files</button><button type="button" class="te-btn" data-view="branches">${I.branch}Branches</button><button type="button" class="te-btn" data-view="commits">${I.rows}Recent commits</button><button type="button" class="te-btn te-ask" data-ask hidden>Ask about this file</button>`;
      el.innerHTML = `<div class="te-split"><nav class="te-tree" aria-label="Files"></nav><div class="te-view"></div></div>`;
      const tree = el.querySelector('.te-tree'), view = el.querySelector('.te-view'), ask = bar.querySelector('[data-ask]');
      const showList = html => { ask.hidden = true; tree.hidden = true; view.parentElement.classList.add('te-single'); view.innerHTML = html; };
      async function dir(path, into) {
        const res = await api.files(path);
        into.innerHTML = res.entries.map(n => n.kind === 'directory'
          ? `<div class="te-node"><button type="button" class="te-item te-dir" data-path="${esc(n.path)}" aria-expanded="false">${I.chev}${esc(n.name)}</button><div class="te-kids" hidden></div></div>`
          : `<button type="button" class="te-item te-file" data-path="${esc(n.path)}">${esc(n.name)}</button>`).join('');
      }
      async function open(path) {
        selected = path; tree.querySelectorAll('.te-file').forEach(b => b.classList.toggle('is-sel', b.dataset.path === path));
        ask.hidden = false;
        let r; try { r = await api.file(path); } catch (error) { view.innerHTML = `<div class="te-empty">${esc(error.message)}</div>`; return; }
        if (selected !== path) return;
        const head = `<div class="te-path">${esc(path)}${r.truncated ? ' <span>(truncated)</span>' : ''}</div>`;
        if (r.binary) view.innerHTML = head + '<div class="te-empty">Binary file.</div>';
        else if (/\.md$/i.test(path)) { view.innerHTML = head + '<article class="te-md"></article>'; view.querySelector('.te-md').innerHTML = DOMPurify.sanitize(marked.parse(r.text), { USE_PROFILES: { html: true }, ALLOW_DATA_ATTR: false, FORBID_TAGS: ['img', 'video', 'audio', 'iframe', 'form', 'input', 'button', 'style'], FORBID_ATTR: ['style', 'id', 'name'] }); }
        else view.innerHTML = head + `<pre class="te-code">${r.text.split('\n').map((l, i) => `<span class="te-ln">${i + 1}</span>${esc(l)}`).join('\n')}</pre>`;
        view.scrollTop = 0;
      }
      tree.addEventListener('click', async e => {
        const b = e.target.closest('.te-item'); if (!b) return;
        if (b.classList.contains('te-file')) return open(b.dataset.path);
        const kids = b.nextElementSibling, openNow = kids.hidden;
        b.setAttribute('aria-expanded', String(openNow)); kids.hidden = !openNow;
        if (openNow && !kids.childElementCount) try { await dir(b.dataset.path, kids); } catch (error) { kids.textContent = error.message; }
      });
      ask.onclick = () => selected && fillComposer(`@${selected} `);
      bar.addEventListener('click', async e => {
        const b = e.target.closest('[data-view]'); if (!b) return;
        bar.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('is-on', x === b));
        if (b.dataset.view === 'tree') { tree.hidden = false; view.parentElement.classList.remove('te-single'); if (selected) open(selected); else view.innerHTML = ''; return; }
        showList('<div class="te-empty">Loading…</div>');
        try {
          if (b.dataset.view === 'branches') { const bs = await api.gitBranches(); showList(`<div class="te-table" data-kind="branches">${bs.map(x => `<div class="te-trow${x.current ? ' is-cur' : ''}"><span class="te-name">${I.branch}${esc(x.name)}${x.current ? '<em>current</em>' : ''}</span><span class="te-sub">${esc(x.subject)}</span><span class="te-age">${esc(x.when)}</span></div>`).join('') || '<div class="te-empty">No branches.</div>'}</div>`); }
          else { const cs = await api.gitLog(); showList(`<div class="te-table" data-kind="commits">${cs.map(x => `<div class="te-trow"><span class="te-sha">${esc(x.sha)}</span><span class="te-sub">${esc(x.subject)}</span><span class="te-who">${esc(x.author)}</span><span class="te-age">${esc(x.when)}</span></div>`).join('') || '<div class="te-empty">No commits.</div>'}</div>`); }
        } catch (error) { showList(`<div class="te-empty">${esc(error.message)}</div>`); }
      });
      bar.querySelector('[data-view="tree"]').classList.add('is-on');
      await dir('', tree);
      const readme = [...tree.querySelectorAll(':scope > .te-file')].find(b => /^readme\.md$/i.test(b.dataset.path));
      if (readme) open(readme.dataset.path); else view.innerHTML = '<div class="te-empty">Select a file.</div>';
    })();
    return () => { alive = false; bar.replaceChildren(); };
  },
});
