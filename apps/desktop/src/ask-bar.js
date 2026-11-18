// The floating ask bar window: one field, an optional screenshot of the current screen, the answer in place, and a way to keep it as a thread.
import './tokens.css';
import './tactile.css';
import './ask-bar.css';
import { icon } from './ui.js';

const EXPLAIN = 'Suffice needs Screen Recording access to see your screen. A screenshot is taken only when you press Ask, goes to your current model, and nothing is captured in the background.';
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const selection = () => { try { return JSON.parse(localStorage.getItem('suffice-model')) || undefined; } catch { return undefined; } };

export function mountAskBar(api = window.sufficeDesktop) {
  document.documentElement.classList.add('ask-bar-window', 'desktop-app');
  const bridge = api.askBar;
  const root = document.querySelector('#app');
  root.innerHTML = `<div class="ask-panel" role="dialog" aria-label="Ask Suffice" data-state="idle">
    <form class="ask-form">
      <div class="ask-field"><textarea id="ask-input" rows="1" maxlength="20000" placeholder="Ask about your screen" aria-label="Question" spellcheck="true"></textarea></div>
      <div class="ask-row">
        <button type="button" class="ask-chip" id="ask-screen" aria-pressed="true" title="Attach a screenshot of the current screen when asking">${icon('monitor')}<span>Screen</span></button>
        <span class="ask-model" id="ask-model"></span>
        <button type="submit" class="ask-send" aria-label="Ask" title="Ask (Enter)">${icon('arrow')}</button>
      </div>
    </form>
    <section class="ask-permission" id="ask-permission" aria-labelledby="ask-permission-title" hidden>
      <h2 id="ask-permission-title">Allow screen recording</h2>
      <p id="ask-permission-text">${EXPLAIN}</p>
      <div class="ask-permission-actions"><button type="button" class="ask-button ask-primary" id="ask-allow">Allow access</button><button type="button" class="ask-button" id="ask-skip">Ask without screen</button></div>
    </section>
    <section class="ask-answer-wrap" id="ask-answer-wrap" hidden>
      <div class="ask-meta" id="ask-meta"></div>
      <div class="ask-answer thread-message" id="ask-answer" role="status" aria-live="polite"></div>
      <div class="ask-actions" id="ask-actions" hidden><button type="button" class="ask-button ask-primary" id="ask-thread">${icon('message')}<span>Send to new thread</span></button><button type="button" class="ask-button" id="ask-copy">${icon('copy')}<span>Copy</span></button></div>
    </section>
    <footer class="ask-keys"><span><kbd>Enter</kbd> Ask</span><span><kbd>Esc</kbd> Close</span></footer>
  </div>`;
  const $ = (id) => root.querySelector('#' + id);
  const panel = root.querySelector('.ask-panel'), form = root.querySelector('.ask-form'), input = $('ask-input'), chip = $('ask-screen');
  const permission = $('ask-permission'), wrap = $('ask-answer-wrap'), answer = $('ask-answer'), meta = $('ask-meta'), actions = $('ask-actions');
  let screenOn = read('suffice-ask-screen', 'true') !== 'false', working = false, threadId = null, text = '', shot = null, markdown = null, frame = 0;

  const setState = (state) => { panel.dataset.state = state; };
  const syncChip = () => { chip.setAttribute('aria-pressed', String(screenOn)); };
  const model = selection();
  $('ask-model').textContent = model?.model || 'Default model';
  syncChip();

  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; };
  input.addEventListener('input', grow);
  new ResizeObserver(() => void bridge.resize(panel.offsetHeight + 40)).observe(panel);

  function showAnswer(value) {
    text = value;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => { markdown ??= (await import('./message-markdown.js')).renderMessageMarkdown; markdown(answer, text); });
  }
  function reset() {
    threadId = null; text = ''; shot = null; wrap.hidden = true; permission.hidden = true; actions.hidden = true; answer.replaceChildren(); meta.replaceChildren(); setState('idle');
  }
  function showPermission(status) {
    const blocked = status === 'denied' || status === 'restricted';
    $('ask-permission-title').textContent = blocked ? 'Screen recording is off' : 'Allow screen recording';
    $('ask-permission-text').textContent = blocked ? 'Turn on Suffice under Privacy & Security, Screen Recording in System Settings, then restart Suffice. ' + EXPLAIN : EXPLAIN;
    $('ask-allow').textContent = blocked ? 'Open System Settings' : 'Allow access';
    $('ask-allow').dataset.status = status;
    wrap.hidden = true; permission.hidden = false; setState('permission'); $('ask-allow').focus();
  }
  async function checkScreen(request) {
    const result = await bridge.capture(request);
    if (result.status === 'granted') { permission.hidden = true; if (panel.dataset.state === 'permission') setState('idle'); return result; }
    showPermission(result.status);
    return result;
  }

  chip.addEventListener('click', async () => {
    screenOn = !screenOn; write('suffice-ask-screen', String(screenOn)); syncChip();
    if (screenOn) await checkScreen(false); else if (panel.dataset.state === 'permission') { permission.hidden = true; setState('idle'); }
    input.focus();
  });
  $('ask-allow').addEventListener('click', async () => {
    const result = await checkScreen(true);
    if (result.status === 'granted') input.focus();
  });
  $('ask-skip').addEventListener('click', () => { screenOn = false; write('suffice-ask-screen', 'false'); syncChip(); permission.hidden = true; setState('idle'); input.focus(); if (input.value.trim()) void ask(); });

  async function ask() {
    const question = input.value.trim();
    if (!question || working) return;
    let image;
    if (screenOn) {
      const result = await checkScreen(false).catch((error) => ({ status: 'error', message: error.message }));
      if (result.status !== 'granted') { if (result.status === 'error') fail(result.message); return; }
      image = result.image;
    }
    working = true; reset(); setState('working'); wrap.hidden = false; form.setAttribute('aria-busy', 'true');
    meta.textContent = image ? 'Looking at your screen' : 'Thinking';
    if (image) { shot = document.createElement('img'); shot.className = 'ask-shot'; shot.alt = 'Screenshot sent with your question'; shot.src = 'data:image/png;base64,' + image; }
    try {
      const result = await bridge.ask({ question, image, selection: selection() });
      threadId = result.threadId; showAnswer(result.text || 'No answer came back.');
      meta.replaceChildren(...(shot ? [shot] : []), Object.assign(document.createElement('span'), { textContent: shot ? 'Screen attached' : 'Answered' }));
      actions.hidden = !threadId; setState('answered');
    } catch (error) { fail(error.message); }
    finally { working = false; form.removeAttribute('aria-busy'); }
  }
  function fail(message) {
    wrap.hidden = false; actions.hidden = true; meta.textContent = 'Could not answer'; answer.textContent = String(message || 'Something went wrong.').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); setState('error');
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); void ask(); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void ask(); } });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); void bridge.close(); } });
  bridge.onText((chunk) => { if (!working) return; if (panel.dataset.state !== 'answering') { setState('answering'); text = ''; meta.textContent = 'Answering'; } showAnswer(text + chunk); });
  $('ask-thread').addEventListener('click', () => { if (threadId) void bridge.send(threadId); });
  $('ask-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); $('ask-copy').querySelector('span').textContent = 'Copied'; setTimeout(() => { $('ask-copy').querySelector('span').textContent = 'Copy'; }, 1400); } catch {} });
  window.addEventListener('focus', () => input.focus());
  input.focus();
}
