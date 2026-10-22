// v4 polyglot task prep + acceptance. Mirrors decomp-v2 bench/polyglot.py (run_tests, restore_tests, fixup, apply_example).
// Never writes under the source repo: prep copies it, runAcceptance copies the workspace again before restoring tests.
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const POLY = join(homedir(), 'bench-repos', 'polyglot-benchmark');
const NODE_MODULES = join(homedir(), 'bench-repos', 'polyglot-node', 'node_modules');
const TIMEOUT_MS = 120_000;

// bins: preflight binaries. cmd: acceptance shell command. compile: detects a build failure (exit code or output).
// shortcut: cpp configure/build failure is marked with exit 97 so it is not confused with a ctest failure, upgrade if cmake changes exit codes.
const SPEC = {
  cpp: {
    bins: () => ['cmake', 'c++'],
    cmd: () => 'cmake -DEXERCISM_RUN_ALL_TESTS=1 -S . -B build && cmake --build build || exit 97; cd build && ctest --output-on-failure',
    compile: code => code === 97,
  },
  go: {
    bins: () => ['go'],
    cmd: () => 'go test ./...',
    compile: (_, out) => /\[(build|setup) failed\]/.test(out),
  },
  java: {
    bins: wd => ['java', ...(existsSync(join(wd, 'gradlew')) ? [] : ['gradle'])],
    cmd: wd => `${existsSync(join(wd, 'gradlew')) ? './gradlew' : 'gradle'} test --offline`,
    compile: (_, out) => /compile\w*Java\S* FAILED|Compilation failed/.test(out),
  },
  javascript: {
    bins: () => ['node', 'npm'],
    cmd: () => 'npm test',
    compile: (_, out) => /Test suite failed to run|SyntaxError/.test(out),
  },
  rust: {
    bins: () => ['cargo'],
    cmd: () => 'cargo test -- --include-ignored',
    compile: (_, out) => /could not compile|error\[E\d+\]/.test(out),
  },
  python: {
    bins: () => ['pytest'],
    cmd: () => 'pytest -q',
    compile: (code, out) => code === 2 || /ERROR collecting|ImportError|SyntaxError/.test(out),
  },
};

// Same fixups polyglot.py applies when restoring tests: java @Disabled removal, jest xtest -> test.
function fixup(lang, text) {
  if (lang === 'java') return text.replace(/@Disabled\([^)]*\)\s*\n/g, '');
  if (lang === 'javascript') return text.replace(/xtest\(/g, 'test(');
  return text;
}

function exerciseSrc(task, polyRoot) {
  const [lang, name] = task.taskId.split('/');
  if (!SPEC[lang] || !name) throw new Error(`v4-polyglot: bad taskId ${task.taskId}`);
  return { lang, name, src: join(polyRoot, lang, 'exercises', 'practice', name) };
}

async function readFiles(src) {
  return JSON.parse(await readFile(join(src, '.meta', 'config.json'), 'utf8')).files;
}

async function destroy(base) {
  await chmod(join(base, '.hidden'), 0o700).catch(() => {});
  await rm(base, { recursive: true, force: true });
}

const hasBin = (bin, env) => new Promise(resolve =>
  execFile('/bin/sh', ['-c', `command -v ${bin}`], { env }, err => resolve(!err)));

function exec(cmd, cwd, env, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn('/bin/sh', ['-c', cmd], { cwd, env, detached: true });
    let out = '';
    const add = d => { out = (out + d.toString()).slice(-200_000); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, timeoutMs);
    child.on('error', err => { clearTimeout(timer); resolve({ code: 127, out: String(err), timedOut }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, timedOut }); });
  });
}

// Copies the exercise into a fresh dir. Acceptance test files are moved to a sibling .hidden dir (chmod 000 between uses).
export async function prepWorkspace(task, { polyRoot = POLY } = {}) {
  const { lang, name, src } = exerciseSrc(task, polyRoot);
  const cfg = await readFiles(src);
  const base = await realpath(await mkdtemp(join(tmpdir(), 'v4-poly-')));
  const dir = join(base, name);
  const hidden = join(base, '.hidden');
  try {
    await cp(src, dir, { recursive: true, verbatimSymlinks: true, filter: p => !/\/\.(meta|approaches)$/.test(p) });
    await mkdir(hidden);
    for (const rel of cfg.test) {
      await mkdir(dirname(join(hidden, rel)), { recursive: true });
      await rename(join(dir, rel), join(hidden, rel));
    }
    await chmod(hidden, 0o000);
  } catch (err) {
    await destroy(base);
    throw err;
  }
  return {
    dir,
    lang,
    hiddenFiles: [...cfg.test],
    acceptanceCommand: SPEC[lang].cmd(dir),
    cleanup: () => destroy(base),
    task, polyRoot,
  };
}

// Pristine copy for verify: prep.dir is the agent's workspace, so re-prepare the same task (its own hidden dir) instead of copying it.
export const cloneForVerify = prep => prepWorkspace(prep.task, { polyRoot: prep.polyRoot });

// Copies the reference solution (.meta/example*) over the stub, like polyglot.py apply_example (zip of solution/example).
export async function applyReference(task, dir, { polyRoot = POLY } = {}) {
  const { src } = exerciseSrc(task, polyRoot);
  const cfg = await readFiles(src);
  // Extra examples (java ocr-numbers Digit.java) go beside the first solution file, as the reference build needs them.
  for (const [i, ex] of cfg.example.entries()) {
    const to = cfg.solution[i] ? join(dir, cfg.solution[i])
      : join(dir, dirname(cfg.solution[0]), basename(ex));
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(src, ex), to);
  }
}

// Runs acceptance in a throwaway copy of prep.dir with the hidden tests restored. Never mutates prep.dir.
export async function runAcceptance(prep, { timeoutMs = TIMEOUT_MS, env = process.env } = {}) {
  const spec = SPEC[prep.lang];
  const run = join(dirname(prep.dir), `run-${randomBytes(4).toString('hex')}`);
  const wd = join(run, basename(prep.dir));
  const hidden = join(dirname(prep.dir), '.hidden');
  const result = (pass, kind, out = '') => ({ pass, kind, output: out.split('\n').slice(-20).join('\n') });
  try {
    await mkdir(run);
    await cp(prep.dir, wd, { recursive: true, verbatimSymlinks: true });
    if (prep.lang === 'javascript') {
      if (!existsSync(NODE_MODULES)) return result(false, 'toolchain_missing', `missing ${NODE_MODULES}`);
      await symlink(NODE_MODULES, join(wd, 'node_modules'));
    }
    await chmod(hidden, 0o700);
    try {
      for (const rel of prep.hiddenFiles) {
        const to = join(wd, rel);
        await mkdir(dirname(to), { recursive: true });
        await writeFile(to, fixup(prep.lang, await readFile(join(hidden, rel), 'utf8')));
      }
    } finally {
      await chmod(hidden, 0o000);
    }
    for (const bin of spec.bins(wd)) {
      if (!(await hasBin(bin, env))) return result(false, 'toolchain_missing', `command not found: ${bin}`);
    }
    const { code, out, timedOut } = await exec(prep.acceptanceCommand, wd,
      { ...env, CARGO_TARGET_DIR: join(run, 'target') }, timeoutMs);
    if (timedOut) return result(false, 'timeout', out);
    if (code === 0) return result(true, 'pass', out);
    return result(false, spec.compile(code, out) ? 'compile_error' : 'test_fail', out);
  } finally {
    await rm(run, { recursive: true, force: true });
  }
}
