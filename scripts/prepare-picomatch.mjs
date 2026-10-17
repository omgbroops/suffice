import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { stateDir, root } from '../src/runtime.mjs';
import { hash, runNodeTests } from '../src/workspace.mjs';
// Pinned npm tarballs (sha256 of .tgz); fix = later release, only lib/parse.js differs.
const tasks = [{
  id: 'picomatch-142', base: ['4.0.6', '0e784763c1045e98a02a258e8678dd985a41ea3f4890b1180002ae2bf26237ac'],
  fix: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/issues/142',
  prompt: 'Fix picomatch so a pattern whose last element is a globstar inside a group, such as test(/utils/**) or test?(/utils/**), matches the parent path test/utils as well as paths below it. Keep the group semantics: a required group must not match the bare prefix, an optional group still may, strictSlashes still rejects a bare parent, and anything following the group still has to match.',
}, {
  id: 'picomatch-99', base: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/issues/99', // reference = micromatch/picomatch@8f5ecc02
  edits: [[`        if (!match) return;\n\n        const source = create(match[1]);`, `        if (!match) return;\n\n        if (match[1] === '**') return;\n\n        const source = create(match[1]);`]],
  prompt: 'Fix picomatch so that ** immediately followed by a literal in the same path segment, such as **.thing.js, behaves like a single * and cannot match across path separators: somepath/test.thing.js must not match **.thing.js, while test.thing.js still does. Do not change how **/ forms or bare ** segments behave.',
}, {
  id: 'picomatch-187', base: ['4.0.7', '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'], referenceFile: 'lib/parse.js',
  issue: 'https://github.com/micromatch/picomatch/issues/187', // reference = micromatch/picomatch@ef533d0d
  edits: [[`      if (opts.posix === true && value === '!' && prev.value === '[') {\n        value = '^';\n      }`,
`      if (value === '!' && prev.value === '[' && opts.literalBrackets !== true) {\n        const isLoneNegation = peek() === ']' && !remaining().slice(1).includes(']');\n        if (!isLoneNegation) {\n          value = '^';\n        }\n      }`]],
  prompt: 'Fix picomatch bracket negation: a leading ! (or ^) inside a bracket class such as [!abc] must negate the class, so isMatch("a", "[!abc]") is false and isMatch("d", "[!abc]") is true, with and without the posix option. Preserve escaped \\!, a non-leading ! as a literal, [!]] negating a closing bracket, an unterminated [!] staying literal, and the literalBrackets / nobracket options.',
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
for (const t of tasks) {
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
    for (const [from, to] of t.edits) { if (text.split(from).length !== 2) throw new Error(`edit anchor not unique in ${t.id}`); text = text.replace(from, () => to); }
    await writeFile(target, text);
  }
  const acc = resolve(root, `benchmarks/real/${t.id}.test.mjs`), vis = resolve(ws, 'tests/visible.test.mjs');
  const r = { baseline: await runNodeTests(ws, acc), reference: await runNodeTests(ref, acc), regression: await runNodeTests(ws, vis), referenceRegression: await runNodeTests(ref, vis) };
  const s = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status]));
  console.log(JSON.stringify({ task: t.id, ...s }));
  await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify({ task: t.id, ...t, ...r }, null, 2));
  if (s.baseline !== 'failed' || s.reference !== 'passed' || s.regression !== 'passed' || s.referenceRegression !== 'passed') throw new Error(`Invalid task ${t.id}`);
}
