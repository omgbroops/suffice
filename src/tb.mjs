// Terminal-Bench leg: agent works on a host dir bind-mounted at /app inside the
// task's env container; bash runs via docker exec; the official verifier image
// grades /app and writes /logs/verifier/reward.*.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stateDir } from './runtime.mjs';
import { createHash } from 'node:crypto';

const tbDir = resolve(stateDir, 'aa-index/tb-tasks/tasks');
const imgDir = resolve(stateDir, 'aa-index/tb-images');
const regDir = resolve(stateDir, 'tb-reg');
mkdirSync(imgDir, { recursive: true });
mkdirSync(regDir, { recursive: true });
const regKey = dir => createHash('sha256').update(dir).digest('hex');
const regPath = dir => join(regDir, regKey(dir));

const sh = (args, opts = {}) => {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: opts.timeoutMs ?? 1_800_000, maxBuffer: 32 * 1024 ** 2 });
  if (opts.check !== false && r.status !== 0) throw new Error(`docker ${args[0]} failed(${r.status}): ${(r.stderr || r.stdout || '').slice(-800)}`);
  return r;
};

export function tbTaskDir(taskId) {
  const dir = resolve(tbDir, taskId);
  if (!existsSync(join(dir, 'instruction.md'))) throw new Error(`TB task not found: ${taskId}`);
  return dir;
}

// Build env + verifier images once per task (flock-guarded so shards share).
export function prepareTb(taskId) {
  const dir = tbTaskDir(taskId);
  const envTag = `tb-env-${taskId}`, verTag = `tb-ver-${taskId}`;
  const lock = join(imgDir, `${taskId}.lock`), mark = join(imgDir, `${taskId}.done`);
  for (;;) { try { mkdirSync(lock, { recursive: false }); break; } catch (e) { if (e.code !== 'EEXIST') throw e; if (existsSync(mark)) return { envTag, verTag }; spawnSync('sleep', ['5']); } }
  try {
    if (!existsSync(mark)) {
      const envDone = join(imgDir, `${taskId}.env`);
      const verDone = join(imgDir, `${taskId}.ver`);
      if (!existsSync(envDone)) {
        const r = sh(['build', '-q', '-t', envTag, join(dir, 'environment')], { check: false, timeoutMs: 3_600_000 });
        if (r.status !== 0) throw new Error(`env build: ${(r.stderr || '').slice(-800)}`);
        writeFileSync(envDone, 'ok');
      }
      if (!existsSync(verDone)) {
        const r = sh(['build', '-q', '-t', verTag, join(dir, 'tests')], { check: false, timeoutMs: 3_600_000 });
        if (r.status !== 0) throw new Error(`verifier build: ${(r.stderr || '').slice(-800)}`);
        writeFileSync(verDone, 'ok');
      }
      writeFileSync(mark, 'ok');
    }
  } finally { rmSync(lock, { recursive: true, force: true }); }
  return { envTag, verTag };
}

// Spin the task container with the host workspace mounted at /app.
// Copies the image's /app content into the host dir first so bind-mount
// doesn't hide baked-in files.
export function tbStart(taskId, workspace) {
  const { envTag } = prepareTb(taskId);
  const ctr = `tb-${taskId}-${process.pid}`;
  sh(['rm', '-f', ctr], { check: false });
  mkdirSync(workspace, { recursive: true });
  // extract image /app into a staging container, copy to host
  sh(['create', '--name', `${ctr}-x`, envTag]);
  try { sh(['cp', `${ctr}-x:/app/.`, workspace], { check: false }); }
  finally { sh(['rm', '-f', `${ctr}-x`], { check: false }); }
  spawnSync('sudo', ['-n', 'chown', '-R', `${process.getuid()}:${process.getgid()}`, workspace]);
  sh(['run', '-d', '--name', ctr, '-v', `${workspace}:/app`, '-w', '/app', envTag, 'sleep', 'infinity']);
  writeFileSync(regPath(workspace), `${ctr} ${workspace}`);
  return ctr;
}

// Stop the container bound to a host workspace and drop its registry entry.
export function tbCleanup(workspace) {
  const p = regPath(workspace);
  if (!existsSync(p)) return;
  const [ctr] = readFileSync(p, 'utf8').split(' ');
  rmSync(p, { force: true });
  if (ctr) sh(['rm', '-f', ctr], { check: false });
  spawnSync('sudo', ['-n', 'chown', '-R', `${process.getuid()}:${process.getgid()}`, resolve(workspace, '..')]);
}

export function tbStop(ctr) { sh(['rm', '-f', ctr], { check: false }); }

export function tbExec(ctr, cmd, { timeoutMs = 300_000 } = {}) {
  const started = Date.now();
  return new Promise(resolveResult => {
    const child = spawn('docker', ['exec', '-w', '/app', ctr, 'bash', '-lc', cmd], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', d => { stdout += d; if (stdout.length > 100_000) stdout = stdout.slice(0, 100_000); });
    child.stderr.on('data', d => { stderr += d; if (stderr.length > 30_000) stderr = stderr.slice(0, 30_000); });
    const stop = () => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeoutMs);
    child.on('error', e => { clearTimeout(timer); resolveResult({ status: 'infrastructure_error', stdout: '', stderr: String(e), latencyMs: Date.now() - started }); });
    child.on('close', code => { clearTimeout(timer); resolveResult({ status: timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed', exitCode: code, stdout, stderr, latencyMs: Date.now() - started }); });
  });
}

// Official grading: verifier container sees the same /app bind + /logs out.
export function tbVerify(taskId, workspace, logsDir, { timeoutMs = 900_000 } = {}) {
  const { verTag } = prepareTb(taskId);
  mkdirSync(logsDir, { recursive: true });
  const ctr = `tbv-${taskId}-${process.pid}`;
  sh(['rm', '-f', ctr], { check: false });
  sh(['create', '--name', ctr, '-v', `${workspace}:/app`, verTag, 'bash', '/tests/test.sh']);
  const r = sh(['start', '-a', ctr], { check: false, timeoutMs });
  sh(['cp', `${ctr}:/logs/verifier`, logsDir], { check: false });
  spawnSync('sudo', ['-n', 'chown', '-R', `${process.getuid()}:${process.getgid()}`, logsDir]);
  sh(['rm', '-f', ctr], { check: false });
  let reward = null;
  for (const f of ['reward.json', 'reward.txt']) {
    const p = join(logsDir, 'verifier', f);
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8').trim();
      reward = f.endsWith('.json') ? (JSON.parse(raw).reward ?? JSON.parse(raw).value) : Number(raw);
    }
  }
  return { reward, passed: reward === 1, verifierStdout: (r.stdout || '').slice(-4000), verifierStderr: (r.stderr || '').slice(-2000), verifierExit: r.status };
}
