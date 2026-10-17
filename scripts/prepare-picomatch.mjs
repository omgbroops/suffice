import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { realTasks } from '../benchmarks/real/tasks.mjs';
import { stateDir, root } from '../src/runtime.mjs';
import { filesIn, hash, runNodeTests } from '../src/workspace.mjs';
// Pinned npm tarballs (sha256 of .tgz); fix = later release, only lib/parse.js differs.
const tasks = [{
  id: 'picomatch-142', base: ['4.0.6', '0e784763c1045e98a02a258e8678dd985a41ea3f4890b1180002ae2bf26237ac'],
  fix: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/issues/142',
}, {
  id: 'picomatch-99', base: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/issues/99', // reference = micromatch/picomatch@8f5ecc02
  edits: [[`        if (!match) return;\n\n        const source = create(match[1]);`, `        if (!match) return;\n\n        if (match[1] === '**') return;\n\n        const source = create(match[1]);`]],
}, {
  id: 'picomatch-187', base: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/issues/187', // reference = micromatch/picomatch@ef533d0d
  edits: [[`      if (opts.posix === true && value === '!' && prev.value === '[') {\n        value = '^';\n      }`,
`      if (value === '!' && prev.value === '[' && opts.literalBrackets !== true) {\n        const isLoneNegation = peek() === ']' && !remaining().slice(1).includes(']');\n        if (!isLoneNegation) {\n          value = '^';\n        }\n      }`]],
}, {
  id: 'picomatch-202', base: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/pull/202', // both globstar sites; PR diff applied to 4.0.7
  edits: [['(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`', '(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL})[\\\\s\\\\S])*?)`']], all: true,
}];
const unpack = (v, sha) => {
  const dir = resolve(tmpdir(), `pm-${v}-${process.pid}`);
  return mkdir(dir, { recursive: true }).then(async () => {
    const p = spawnSync('npm', ['pack', `picomatch@${v}`, '--silent'], { cwd: dir, encoding: 'utf8' });
    if (p.status !== 0) throw new Error(`npm pack failed: ${p.stderr}`);
    const tgz = resolve(dir, `picomatch-${v}.tgz`);
    if (hash(await readFile(tgz)) !== sha) throw new Error(`checksum mismatch for picomatch@${v}`);
    if (spawnSync('tar', ['-xzf', tgz, '-C', dir]).status !== 0) throw new Error('tar failed');
    return resolve(dir, 'package');
  });
};
for (const t of tasks.map(t => ({ ...t, prompt: realTasks.find(r => r.id === t.id).prompt }))) {
  const taskDir = resolve(stateDir, 'real-tasks', t.id), ws = resolve(taskDir, 'workspace'), ref = resolve(taskDir, 'reference');
  await rm(taskDir, { recursive: true, force: true });
  const base = await unpack(...t.base), fix = t.fix && await unpack(...t.fix);
  await mkdir(resolve(ws, 'tests'), { recursive: true });
  await cp(base, resolve(ws, 'src'), { recursive: true });
  await cp(resolve(root, 'benchmarks/real/picomatch-visible.test.mjs'), resolve(ws, 'tests/visible.test.mjs'));
  await writeFile(resolve(ws, 'README.md'), `# picomatch repair task\n\n${t.prompt}\n\nThe upstream package is under src/. Only production JavaScript under src/lib may be edited. The provided test tool runs a small smoke suite; hidden acceptance is evaluated separately. No dependency installation is needed.\n`);
  await cp(ws, ref, { recursive: true });
  const target = resolve(ref, 'src', t.referenceFile);
  if (fix) await cp(resolve(fix, t.referenceFile), target);
  else {
    let text = await readFile(target, 'utf8');
    for (const [from, to] of t.edits) { if (text.split(from).length !== (t.all ? 3 : 2)) throw new Error(`edit anchor not unique in ${t.id}`); text = text.replaceAll(from, () => to); }
    await writeFile(target, text);
  }
  const acc = resolve(root, `benchmarks/real/${t.id}.test.mjs`), vis = resolve(ws, 'tests/visible.test.mjs');
  const r = { baseline: await runNodeTests(ws, acc), reference: await runNodeTests(ref, acc), regression: await runNodeTests(ws, vis), referenceRegression: await runNodeTests(ref, vis) };
  const s = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status]));
  console.log(JSON.stringify({ task: t.id, ...s }));
  const sourceFiles = (await filesIn(ws)).filter(p => /^src\/(lib\/.*|index|posix)\.js$/.test(p));
  await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify({ task: t.id, ...t, sourceFiles, ...r }, null, 2));
  if (s.baseline !== 'failed' || s.reference !== 'passed' || s.regression !== 'passed' || s.referenceRegression !== 'passed') throw new Error(`Invalid task ${t.id}`);
}
