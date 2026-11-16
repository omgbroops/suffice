// Sessions: an agent CLI runs in a tmux session on a dedicated socket; one session, three views
// (real terminal attach, in-app terminal via stream/screen/sendBytes, in-app chat via transcript tail).
// Compliance: the vendor binary is run unmodified with the user's own login; this module never reads,
// stores or forwards vendor credentials or tokens, and never sets auth env vars for the vendor CLI.
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { assertShape } from '../contract.mjs';
import { builtinAgents } from './adapters.mjs';

const ID = /^[a-f0-9]+$/;
const SAFE_SID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const sq = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const dim = (n, what) => { if (!Number.isInteger(n) || n < 1 || n > 1000) throw new TypeError(`${what} must be an integer 1..1000`); return String(n); };

/** Tails a file: reads from the last offset on every fs.watch event (no polling). The file and its parent dirs may appear later:
 *  the watch sits on the nearest existing ancestor of `root` and moves down as dirs appear. */
function tail(fs, resolve, root, onData, onReset = () => {}) {
  let file = null; let offset = 0; let ino = null; let stopped = false; let fw = null; let w = null; let wDir = null; let settle = null;
  const nearest = () => { let d = root; for (;;) { try { fs.statSync(d); return d; } catch { const up = path.dirname(d); if (up === d) return null; d = up; } } };
  const arm = () => {
    const want = nearest();
    if (!want || want === wDir) return;
    try { w?.close(); } catch { /* already closed */ }
    w = null; wDir = want;
    // recursive only on the root itself: an ancestor (maybe $HOME) is watched one level deep and re-armed on each event
    try { w = fs.watch(want, { recursive: want === root }, read); w.on?.('error', () => {}); } catch { wDir = null; return; }
    if (nearest() !== want) arm(); // a dir appeared while the watch was being set up
    // shortcut: FSEvents can drop writes made just after a watch is armed (seen under load); two catch-up reads, no polling beyond that
    for (const ms of [250, 1000]) { const c = setTimeout(read, ms); c.unref?.(); }
  };
  const watchFile = () => { try { fw?.close(); } catch { /* closed */ } fw = null; try { fw = fs.watch(file, read); fw.on?.('error', () => {}); } catch { /* not there yet */ } };
  function read() {
    if (stopped) return;
    try {
      arm();
      file ??= resolve();
      if (!file) return;
      // FSEvents (dir watch) registers late and drops early writes; a watch on the file itself is synchronous, then catch up below
      if (!fw) watchFile();
      const st = fs.statSync(file);
      // truncated or replaced (new inode): start over and drop half-read state, or old bytes would corrupt the new content
      if ((ino !== null && st.ino !== ino) || st.size < offset) { if (ino !== null && st.ino !== ino) watchFile(); offset = 0; onReset(); }
      ino = st.ino;
      const size = st.size;
      if (size === offset) return;
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(size - offset);
        const n = fs.readSync(fd, buf, 0, buf.length, offset);
        offset += n;
        // watch events can coalesce or drop under bursts: after data, re-read once shortly; ends at the first empty read
        if (n) { onData(buf.subarray(0, n)); clearTimeout(settle); settle = setTimeout(read, 40); settle.unref?.(); }
      } finally { fs.closeSync(fd); }
    } catch { /* file not there yet or vanished: wait for the next event */ }
  }
  read();
  return () => { stopped = true; clearTimeout(settle); try { w?.close(); fw?.close(); } catch { /* already closed */ } };
}

function lineParser(adapter) {
  let dec = new StringDecoder('utf8'); let rest = '';
  const parse = (buf) => {
    rest += dec.write(buf);
    const parts = rest.split('\n'); rest = parts.pop(); // partial last line waits for its newline
    return parts.flatMap((l) => { if (!l.trim()) return []; try { return adapter.parseLine(JSON.parse(l)) ?? []; } catch { return []; } });
  };
  parse.reset = () => { dec = new StringDecoder('utf8'); rest = ''; };
  return parse;
}

export function createSessions({ exec, clock, slots, fs = nodeFs, home = os.homedir(), socketName = 'suffice', tmuxBin = 'tmux', agents = {} } = {}) {
  assertShape('sessions.exec', { exec }, ['exec']);
  assertShape('sessions.clock', clock, ['now']);
  if (!/^[A-Za-z0-9._-]+$/.test(socketName)) throw new TypeError('sessions: bad socketName');
  const adapters = { ...builtinAgents, ...agents };
  const live = new Map(); // id -> session record
  const handles = new Map(); // id -> {chat, meta}

  const tmux = async (args, { allowFail = false } = {}) => {
    // -f /dev/null: the dedicated socket must not load the user's tmux.conf (its hooks kill fresh servers)
    const r = await exec(tmuxBin, ['-f', '/dev/null', '-L', socketName, ...args], {});
    if (r.code !== 0 && !allowFail) throw new Error(`tmux ${args[0]} failed: ${(r.stderr || '').trim() || `exit ${r.code}`}`);
    return r;
  };
  const need = (id) => {
    if (typeof id !== 'string' || !ID.test(id)) throw new TypeError('sessions: bad session id');
    return `sfx-${id}`;
  };
  const rec = (id) => { need(id); const s = live.get(id); if (!s) throw new Error(`sessions: unknown session ${id}`); return s; };

  const listDef = slots?.define({ id: 'sessions:list', title: 'Sessions', schema: { type: 'array' } }, []);
  const publishList = () => listDef?.set([...live.values()].map((s) => ({ id: s.id, name: s.name, agent: s.agent, cwd: s.cwd, attachCommand: s.attachCommand })));

  // a transcript path held by another live session is never handed out again (two codex sessions in one cwd)
  const locate = (adapter, s) => adapter.locateTranscript({ home, cwd: s.cwd, sessionId: s.sessionId, startedAt: s.startedAt, fs,
    claimed: new Set([...live.values()].filter((o) => o !== s).map((o) => o.transcriptPath).filter(Boolean)) }) ?? null;

  function ensureChat(s) {
    if (s.chat) return s.chat;
    const adapter = adapters[s.agent];
    const parse = lineParser(adapter);
    const c = (s.chat = { messages: [], listeners: new Set(), stop: null });
    const root = adapter.watchRoot?.({ home }) ?? path.dirname(s.transcriptPath ?? home);
    c.stop = tail(fs, () => s.transcriptPath ?? (s.transcriptPath = locate(adapter, s)), root, (buf) => {
      const m = parse(buf);
      if (!m.length) return;
      c.messages.push(...m);
      handles.get(s.id)?.chat.set(c.messages);
      for (const f of c.listeners) f(m);
    }, parse.reset);
    return c;
  }
  const dropChat = (s) => { s.chat?.stop?.(); s.chat = null; for (const u of [...(s.raws ?? [])]) u(); };

  // live record + slots + chat tail for one session; undoes itself and kills nothing on failure (callers decide)
  async function register(s, adapter, name, { killOnFail = true } = {}) {
    const { id } = s; const h = {};
    try {
      try { s.transcriptPath = locate(adapter, s); } catch { /* locate lazily */ }
      live.set(id, s);
      if (slots) {
        handles.set(id, h);
        h.chat = slots.define({ id: `session:${id}:chat`, title: `Chat ${id}`, schema: { type: 'array' } }, []);
        h.meta = slots.define({ id: `session:${id}:meta`, title: `Session ${id}`, schema: { type: 'object' } }, { attachCommand: s.attachCommand, agent: s.agent, cwd: s.cwd, state: 'running' });
        ensureChat(s); // keeps the chat slot live without any subscriber
      }
      publishList();
    } catch (e) {
      live.delete(id); handles.delete(id); dropChat(s); h.chat?.remove(); h.meta?.remove();
      if (killOnFail) await tmux(['kill-session', '-t', name], { allowFail: true }).catch(() => {});
      try { publishList(); } catch { /* original error wins */ }
      throw e;
    }
  }

  async function start({ agent, cwd, args = [], cols = 120, rows = 32, sessionId: given, resume = false } = {}) {
    const adapter = adapters[agent];
    if (!adapter) throw new TypeError(`sessions: unknown agent ${agent}`);
    if (typeof cwd !== 'string' || !cwd) throw new TypeError('sessions: cwd required');
    if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) throw new TypeError('sessions: args must be strings');
    const id = randomBytes(4).toString('hex'); const name = `sfx-${id}`;
    if (resume && (typeof given !== 'string' || !SAFE_SID.test(given))) throw new TypeError('sessions: resume needs a safe sessionId string');
    const sessionId = given ?? adapter.newSessionId?.() ?? null;
    const agentArgs = resume ? adapter.resumeArgs({ sessionId }) : adapter.startArgs({ sessionId });
    const startedAt = clock.now();
    await tmux(['new-session', '-d', '-s', name, '-x', dim(cols, 'cols'), '-y', dim(rows, 'rows'), '-c', cwd, '--', adapter.bin, ...agentArgs, ...args]);
    const s = { id, name, agent, cwd, sessionId, startedAt, attachCommand: `tmux -L ${socketName} attach -t ${name}`, transcriptPath: null, chat: null, streams: new Set(), pipe: null, pipeSetup: null };
    // kept in tmux so a restarted app can re-adopt the session (see list)
    await tmux(['set-option', '-t', name, '@sfx', JSON.stringify({ agent, cwd, sessionId, startedAt }), ';', 'set-option', '-t', name, 'status', 'off'], { allowFail: true }).catch(() => {});
    await register(s, adapter, name);
    return { id, name, agent, cwd, attachCommand: s.attachCommand, ...(s.transcriptPath ? { transcriptPath: s.transcriptPath } : {}) };
  }

  // drop everything held for a session: chat tail, stream subscribers (and the pipe), live record, slots
  async function forget(s) {
    dropChat(s);
    await Promise.all([...s.streams].map((u) => u()));
    live.delete(s.id);
    const h = handles.get(s.id);
    if (h) { h.chat?.remove(); h.meta?.remove(); handles.delete(s.id); }
  }

  async function list() {
    const r = await tmux(['list-sessions', '-F', '#{session_name}\t#{session_created}\t#{session_attached}\t#{@sfx}'], { allowFail: true });
    const rows = r.code !== 0 ? [] : r.stdout.split('\n').map((l) => l.split('\t')).filter((p) => /^sfx-[a-f0-9]+$/.test(p[0]));
    const present = new Set(rows.map((p) => p[0].slice(4)));
    const gone = [...live.values()].filter((s) => !present.has(s.id)); // tmux session exited on its own
    for (const s of gone) await forget(s);
    if (gone.length) publishList();
    // sessions started by an earlier process: rebuild the record from the tmux option written at start
    for (const p of rows) {
      const id = p[0].slice(4);
      if (live.has(id) || !p[3]) continue;
      try {
        const m = JSON.parse(p[3]);
        if (!adapters[m.agent] || typeof m.cwd !== 'string') continue;
        await register({ id, name: p[0], agent: m.agent, cwd: m.cwd, sessionId: m.sessionId ?? null, startedAt: Number(m.startedAt) || clock.now(), attachCommand: `tmux -L ${socketName} attach -t ${p[0]}`, transcriptPath: null, chat: null, streams: new Set(), pipe: null, pipeSetup: null }, adapters[m.agent], p[0], { killOnFail: false });
      } catch { /* unreadable meta: stays listed without agent/cwd */ }
    }
    return rows.map(([name, created, attached]) => {
      const id = name.slice(4); const s = live.get(id);
      return { id, name, agent: s?.agent, cwd: s?.cwd, created: Number(created), attached: Number(attached) > 0, attachCommand: `tmux -L ${socketName} attach -t ${name}` };
    });
  }

  // shutdown: release chat tails and stream pipes; tmux sessions keep running and are re-adopted by list()
  async function close() { for (const s of [...live.values()]) await forget(s); }

  async function stop(id) {
    const name = need(id); const s = live.get(id);
    try { await tmux(['kill-session', '-t', name], { allowFail: true }); } catch { /* already gone: clean up anyway */ }
    if (s) await forget(s);
    publishList();
  }

  async function resize(id, cols, rows) { await tmux(['resize-window', '-t', need(id), '-x', dim(cols, 'cols'), '-y', dim(rows, 'rows')]); }
  async function send(id, text, { enter = true } = {}) {
    const name = need(id);
    if (typeof text !== 'string') throw new TypeError('sessions: text must be a string');
    // tmux eats one trailing ';' (command separator) even after -l --: a doubled one arrives as exactly one
    if (text) await tmux(['send-keys', '-t', name, '-l', '--', text.endsWith(';') ? `${text};` : text]);
    if (enter) await tmux(['send-keys', '-t', name, 'Enter']);
  }
  async function sendBytes(id, bytes) {
    const name = need(id);
    if (!(bytes instanceof Uint8Array)) throw new TypeError('sessions: bytes must be a Uint8Array');
    if (bytes.length) await tmux(['send-keys', '-t', name, '-H', ...Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))]);
  }
  async function screen(id) {
    const name = need(id);
    const [t, a] = [await tmux(['capture-pane', '-p', '-t', name]), await tmux(['capture-pane', '-p', '-e', '-t', name])];
    return { text: t.stdout, ansi: a.stdout };
  }

  // One pipe-pane per session (tmux allows a single pipe), fanned out to every subscriber; setup is one shared promise.
  async function setupPipe(s, name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-stream-'));
    const file = path.join(dir, 'out.bin');
    try { fs.writeFileSync(file, ''); await tmux(['pipe-pane', '-t', name, `cat >> ${sq(file)}`]); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
    const subs = new Set();
    return (s.pipe = { dir, subs, stopTail: tail(fs, () => file, dir, (b) => { for (const f of [...subs]) f(b); }) });
  }
  async function closePipe(s, name, pipe) {
    s.pipe = null; s.pipeSetup = null; pipe.stopTail();
    try { await tmux(['pipe-pane', '-t', name], { allowFail: true }); } catch { /* session gone */ }
    fs.rmSync(pipe.dir, { recursive: true, force: true });
  }
  async function stream(id, onBytes) {
    const name = need(id); const s = rec(id);
    s.pipeSetup ??= setupPipe(s, name).catch((e) => { s.pipeSetup = null; throw e; });
    const pipe = await s.pipeSetup;
    if (live.get(id) !== s) { if (s.pipe === pipe) await closePipe(s, name, pipe); throw new Error(`sessions: unknown session ${id}`); }
    pipe.subs.add(onBytes);
    const unsub = () => {
      if (!s.streams.delete(unsub)) return undefined;
      pipe.subs.delete(onBytes);
      return !pipe.subs.size && s.pipe === pipe ? closePipe(s, name, pipe) : undefined;
    };
    s.streams.add(unsub);
    return unsub;
  }

  function chat(id, onMessages) {
    const s = rec(id); const c = ensureChat(s);
    if (c.messages.length) onMessages([...c.messages]);
    c.listeners.add(onMessages);
    return () => { c.listeners.delete(onMessages); if (!c.listeners.size && !slots) dropChat(s); };
  }
  // Raw transcript lines (unparsed strings), for mappers that need the whole JSON object. `onReset` fires when the file restarts.
  function rawLines(id, onLine, onReset = () => {}) {
    const s = rec(id); const adapter = adapters[s.agent];
    let dec = new StringDecoder('utf8'); let rest = '';
    const root = adapter.watchRoot?.({ home }) ?? path.dirname(s.transcriptPath ?? home);
    const stop = tail(fs, () => s.transcriptPath ?? (s.transcriptPath = locate(adapter, s)), root, (buf) => {
      rest += dec.write(buf); const parts = rest.split('\n'); rest = parts.pop();
      for (const l of parts) if (l.trim()) onLine(l);
    }, () => { dec = new StringDecoder('utf8'); rest = ''; onReset(); });
    (s.raws ??= new Set()).add(unsub);
    function unsub() { if (s.raws?.delete(unsub)) stop(); }
    return unsub;
  }
  const messages = (id) => [...ensureChat(rec(id)).messages];

  const adapterFor = (agent) => { const a = adapters[agent]; if (!a) throw new TypeError(`sessions: unknown agent ${agent}`); return a; };
  const history = {
    list: ({ agent, cwd } = {}) => adapterFor(agent).listHistory({ home, fs }).filter((h) => !cwd || h.cwd === cwd).sort((a, b) => b.startedAt - a.startedAt),
    read(file, agent) {
      const parse = lineParser(adapterFor(agent));
      return parse(Buffer.from(fs.readFileSync(file, 'utf8').replace(/\n?$/, '\n')));
    },
  };
  const resume = ({ agent, sessionId, cwd }) => start({ agent, cwd, sessionId, resume: true });

  return { start, list, stop, close, resize, send, sendBytes, screen, stream, chat, messages, rawLines, history, resume };
}
