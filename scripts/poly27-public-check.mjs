// Public, actor-generated checks only. This helper never loads the withheld exercise suite.
import {mkdtemp, mkdir, readFile, writeFile, readdir, lstat, realpath, rm, copyFile, chmod, symlink} from 'node:fs/promises';
import {resolve, join, relative, sep, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {runProcess} from '../src/v9/process.mjs';

export const PUBLIC_CHECK_INSTRUCTIONS = Object.freeze({
  cpp: 'Write .suffice-v10-checks/generated.cpp using the supplied Catch header (#include "catch.hpp"), TEST_CASE and REQUIRE. Include the public solution header by basename. Do not define main or CATCH_CONFIG_MAIN. The helper compiles the solution .cpp files, supplied test/tests-main.cpp and this exact generated file with C++17, then reads the Catch JUnit report.',
  go: 'Write .suffice-v10-checks/generated_test.go with the same package as the solution, import testing, and define TestXxx functions using testing.T assertions. The helper copies this exact file into an isolated package copy, excludes other *_test.go files, and runs go test -json -count=1 . offline.',
  java: 'Write .suffice-v10-checks/GeneratedCheck.java with a public class GeneratedCheck (no package), JUnit Jupiter @Test methods and org.junit.jupiter.api.Assertions or AssertJ. The helper copies this exact file into isolated src/test/java and runs only its class with Gradle offline, reading JUnit XML. Do not use @Disabled.',
  javascript: 'Write .suffice-v10-checks/generated.test.js with Jest test()/expect() assertions and import the public solution from ../<solution>.js. The helper runs this exact path using Jest --runTestsByPath --runInBand and reads its JSON report. Do not use test.skip or test.todo.',
  python: 'Write .suffice-v10-checks/generated_test.py with pytest test_ functions and import the public solution module by basename. The helper copies this exact file to an isolated workspace root and runs only that file with pytest and a JUnit XML report. Do not skip tests.',
  rust: 'Write .suffice-v10-checks/generated.rs as an integration test: import the public crate (Cargo package name with hyphens changed to underscores) and define #[test] functions. The helper copies this exact file to isolated tests/suffice_generated.rs and runs cargo test --offline --test suffice_generated. Do not use #[ignore].',
});

const emptyCounts = () => ({tests: 0, passed: 0, failed: 0, skipped: 0});
function checked(counts) {
  if (!counts || Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0) || counts.tests !== counts.passed + counts.failed) return null;
  return counts;
}
export function parseGoCounts(text) {
  const cases = new Map(); let terminal = false;
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    let event; try { event = JSON.parse(line); } catch { return null; }
    if (['pass', 'fail'].includes(event.Action) && !event.Test && typeof event.Package === 'string') terminal = true;
    if (event.Test && ['pass', 'fail', 'skip'].includes(event.Action)) {
      const key = `${event.Package}\0${event.Test}`;
      if (cases.has(key)) return null;
      cases.set(key, event.Action);
    }
  }
  if (!terminal) return null;
  // Count the actual terminal test events, including subtests. Never infer tests from assertions.
  const out = emptyCounts();
  for (const state of cases.values()) if (state === 'skip') out.skipped++; else {out.tests++; out[state === 'pass' ? 'passed' : 'failed']++;}
  return checked(out);
}
export function parseJUnitCounts(xml) {
  const source = String(xml);
  if (!/<testsuites?\b/.test(source) || !/<\/testsuites?>\s*$/.test(source)) return null;
  // Collection/initialization errors are not proof that a named test body ran.
  if (/<error\b/.test(source)) return null;
  const out = emptyCounts();
  const cases = [...source.matchAll(/<testcase\b[^>]*?(?:\/>|>([\s\S]*?)<\/testcase\s*>)/g)];
  // Reject truncated/unparsed testcase entries rather than counting incomplete XML.
  if (cases.length !== [...source.matchAll(/<testcase\b/g)].length) return null;
  for (const entry of cases) {
    const body = entry[1] ?? '';
    if (/<skipped\b/.test(body)) out.skipped++;
    else {out.tests++; out[/<(?:failure|error)\b/.test(body) ? 'failed' : 'passed']++;}
  }
  // A suite-level error is not an executed passing case.
  const suiteErrors = [...source.matchAll(/<testsuite\b[^>]*\berrors=["'](\d+)["']/g)].reduce((n,m) => n + Number(m[1]), 0);
  if (suiteErrors > out.failed) return null;
  return checked(out);
}
export function parseJestCounts(text) {
  let report; try { report = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(report.testResults) || !report.testResults.length) return null;
  const out = emptyCounts();
  for (const suite of report.testResults) {
    if (!Array.isArray(suite.assertionResults) || (!suite.assertionResults.length && suite.status === 'failed')) return null;
    for (const test of suite.assertionResults) {
      if (test.status === 'passed' || test.status === 'failed') {out.tests++; out[test.status]++;}
      else if (['pending', 'todo', 'disabled', 'skipped'].includes(test.status)) out.skipped++;
      else return null;
    }
  }
  const total = out.tests + out.skipped;
  if (report.numTotalTests !== total || report.numPassedTests !== out.passed || report.numFailedTests !== out.failed) return null;
  return checked(out);
}
export function parseRustCounts(text) {
  const matches = [...String(text).matchAll(/^test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out;.*$/gm)];
  if (matches.length !== 1) return null;
  const [passed, failed, skipped, measured] = matches[0].slice(1).map(Number);
  if (measured !== 0) return null;
  return checked({tests: passed + failed, passed, failed, skipped});
}

async function generatedPath(workspace, path, lang) {
  const endings = {cpp: '.cpp', go: '_test.go', java: '.java', javascript: '.test.js', python: '_test.py', rust: '.rs'};
  if (!Object.hasOwn(endings, lang)) throw Error('Unsupported public-check language');
  if (typeof path !== 'string' || !/^\.suffice-v10-checks\/[A-Za-z0-9_.-]+$/.test(path) || !path.endsWith(endings[lang])) throw Error(`Expected a generated ${lang} test under .suffice-v10-checks/`);
  const directory = join(workspace, '.suffice-v10-checks');
  if ((await lstat(directory)).isSymbolicLink() || !(await lstat(directory)).isDirectory()) throw Error('Generated-check directory must be a regular directory');
  const target = resolve(workspace, path), stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 16_000) throw Error('Generated check must be a bounded regular file');
  const canonical = await realpath(target), rel = relative(workspace, canonical);
  if (rel.startsWith('..' + sep) || rel === '..' || resolve(workspace, rel) !== canonical) throw Error('Generated test escaped workspace');
  return canonical;
}
const omittedDirectories = new Set(['.git', '.suffice-v10-checks', 'node_modules', 'target', 'build', '.gradle', '.pytest_cache', '__pycache__', 'out', '.idea']);
async function copySources(source, destination, lang, state = {files: 0, bytes: 0}, prefix = '') {
  await mkdir(destination, {recursive: true});
  for (const entry of await readdir(source, {withFileTypes: true})) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory() && (omittedDirectories.has(entry.name) || (lang === 'java' && rel === 'src/test'))) continue;
    if (lang === 'go' && entry.name.endsWith('_test.go')) continue;
    const from = join(source, entry.name), to = join(destination, entry.name), stat = await lstat(from);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw Error(`Unsupported actor-source entry: ${rel}`);
    if (stat.isDirectory()) await copySources(from, to, lang, state, rel);
    else {
      if (++state.files > 2000 || (state.bytes += stat.size) > 32 * 1024 * 1024) throw Error('Actor source copy exceeds bound');
      await copyFile(from, to); await chmod(to, stat.mode & 0o777);
    }
  }
}
async function cppSources(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !['test', 'tests', '.suffice-v10-checks'].includes(entry.name)) files.push(...await cppSources(root, path));
    else if (entry.isFile() && path.endsWith('.cpp') && !/(?:_test|\.test)\.cpp$/.test(path)) files.push(join(root, path));
  }
  return files.sort();
}
async function optionalText(path) {try {return await readFile(path, 'utf8');} catch (error) {if (error.code === 'ENOENT') return null; throw error;}}
async function findXml(root) {
  let entries; try {entries = await readdir(root, {withFileTypes: true});} catch (error) {if (error.code === 'ENOENT') return []; throw error;}
  const files = [];
  for (const entry of entries) if (entry.isDirectory()) files.push(...await findXml(join(root, entry.name))); else if (entry.isFile() && entry.name.endsWith('.xml')) files.push(join(root, entry.name));
  return files.sort();
}

export async function runPublicGeneratedCheck({lang, generated, workspace = process.cwd(), timeoutMs = 55_000, run = runProcess, env = process.env, tempRoot = tmpdir()} = {}) {
  const started = Date.now(), calls = []; let temporary;
  try {
    workspace = await realpath(resolve(workspace));
    const input = await generatedPath(workspace, generated, lang), content = await readFile(input, 'utf8');
    temporary = await mkdtemp(join(tempRoot, 'suffice-public-check-'));
    const scratch = join(temporary, basename(workspace)), report = join(temporary, 'test-report.xml');
    await copySources(workspace, scratch, lang);
    const generatedDirectory = join(scratch, '.suffice-v10-checks'); await mkdir(generatedDirectory);
    const selected = join(scratch, generated); await writeFile(selected, content, {flag: 'wx'});
    const runtimeEnv = {...env, CARGO_NET_OFFLINE: 'true', CARGO_TARGET_DIR: join(temporary, 'cargo-target'), GOPROXY: 'off', GOSUMDB: 'off', PYTHONDONTWRITEBYTECODE: '1'};
    const exec = async (command, args, phase = 'test') => {
      const remaining = Math.max(1, timeoutMs - (Date.now() - started));
      const result = await run(command, args, {cwd: scratch, env: runtimeEnv, timeoutMs: remaining, maxBytes: 2_000_000});
      calls.push({command, args, phase, ...result}); return result;
    };
    let result, counts = null, reportText;
    if (lang === 'cpp') {
      const executable = join(temporary, process.platform === 'win32' ? 'generated.exe' : 'generated');
      result = await exec(env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Wpedantic', '-Werror', '-DEXERCISM_RUN_ALL_TESTS', '-I', scratch, '-I', join(scratch, 'test'), ...await cppSources(scratch), join(scratch, 'test/tests-main.cpp'), selected, '-o', executable], 'compile');
      if (result.exitCode === 0 && !result.error && !result.timedOut && !result.overflow && !result.aborted) {
        result = await exec(executable, ['--reporter', 'junit', '--out', report]);
        reportText = await optionalText(report); if (reportText !== null) counts = parseJUnitCounts(reportText);
      }
    } else if (lang === 'go') {
      await writeFile(join(scratch, 'zz_suffice_generated_test.go'), content, {flag: 'wx'});
      result = await exec('go', ['test', '-json', '-count=1', '.']); counts = parseGoCounts(result.stdout);
    } else if (lang === 'java') {
      const name = basename(generated, '.java');
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || !new RegExp(`\\bpublic\\s+(?:(?:final|abstract)\\s+)?class\\s+${name}\\b`).test(content) || /^\s*package\s+/m.test(content)) throw Error('Generated Java file must have a matching public class and no package');
      await mkdir(join(scratch, 'src/test/java'), {recursive: true});
      await writeFile(join(scratch, 'src/test/java', basename(generated)), content, {flag: 'wx'});
      result = await exec(env.POLY27_GRADLE_BIN || '/opt/gradle/gradle-8.7/bin/gradle', ['--offline', '--no-daemon', '--console=plain', '--project-cache-dir', join(temporary, 'gradle-project-cache'), 'test', '--tests', name]);
      const reports = await findXml(join(scratch, 'build/test-results/test'));
      const parsed = await Promise.all(reports.map(async path => parseJUnitCounts(await readFile(path, 'utf8'))));
      if (parsed.length && parsed.every(Boolean)) counts = parsed.reduce((sum, row) => Object.fromEntries(Object.keys(sum).map(k => [k, sum[k] + row[k]])), emptyCounts());
    } else if (lang === 'javascript') {
      const modules = await realpath(env.POLY27_NODE_MODULES || '/opt/bench/node_modules');
      await symlink(modules, join(scratch, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      const jsonReport = join(temporary, 'jest-report.json');
      result = await exec(process.execPath, [join(modules, 'jest/bin/jest.js'), '--runTestsByPath', selected, '--runInBand', '--no-cache', '--watch=false', '--json', '--outputFile', jsonReport, '--testMatch', '**/.suffice-v10-checks/*.test.js']);
      reportText = await optionalText(jsonReport); if (reportText !== null) counts = parseJestCounts(reportText);
    } else if (lang === 'python') {
      const testFile = join(scratch, 'suffice_generated_test.py'); await writeFile(testFile, content, {flag: 'wx'});
      runtimeEnv.PYTHONPATH = [scratch, env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
      result = await exec(env.PYTHON || 'python3', ['-m', 'pytest', '-q', '-rA', '-p', 'no:cacheprovider', '--junitxml', report, testFile]);
      reportText = await optionalText(report); if (reportText !== null) counts = parseJUnitCounts(reportText);
    } else if (lang === 'rust') {
      await mkdir(join(scratch, 'tests'), {recursive: true}); await writeFile(join(scratch, 'tests/suffice_generated.rs'), content, {flag: 'wx'});
      result = await exec('cargo', ['test', '--offline', '--test', 'suffice_generated', '--', '--nocapture']); counts = parseRustCounts(result.stdout);
    }
    const incomplete = calls.some(row => row.error || row.timedOut || row.overflow || row.aborted);
    const compilationFailure = !incomplete && result.exitCode !== 0 && (!counts || counts.tests === 0) && (calls.at(-1).phase === 'compile' || /(?:build failed|compilation failed|could not compile|compileJava FAILED|compileTestJava FAILED|SyntaxError|ImportError|ModuleNotFoundError|error\[E\d+\])/i.test(`${result.stdout}\n${result.stderr}`));
    const status = incomplete ? 'unverified' : compilationFailure ? 'failed' : !counts || !counts.tests || counts.skipped ? 'unverified' : result.exitCode !== 0 || counts.failed ? 'failed' : 'passed';
    return {lang, generated, status, counts: counts ?? (compilationFailure ? emptyCounts() : null), countsKnown: counts !== null || compilationFailure, exitCode: status === 'passed' ? 0 : status === 'failed' ? 1 : 2, calls, latencyMs: Date.now() - started};
  } catch (error) {
    return {lang, generated, status: 'unverified', counts: null, countsKnown: false, exitCode: 2, error: error.message, calls, latencyMs: Date.now() - started};
  } finally {if (temporary) await rm(temporary, {recursive: true, force: true});}
}

export function formatPublicResult(result) {
  const counts = result.counts ?? emptyCounts();
  const detail = result.calls.map(({command, args, phase, stdout, stderr, error}) => `${phase}: ${JSON.stringify([command, ...args])}\n${stdout ?? ''}\n${stderr ?? ''}${error ? `\n${error}` : ''}`).join('\n');
  // The zero markers for unverified runs mean zero CONFIRMED executed cases, not a successful suite.
  return `${detail}\n${result.error ?? ''}\nPublic generated-check status: ${result.status}; authenticated counts: ${result.countsKnown}\n# tests ${counts.tests}\n# pass ${counts.passed}\n# fail ${counts.failed}\n# skip ${counts.skipped}\n`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [lang, generated, extra] = process.argv.slice(2);
  if (extra || !lang || !generated) {process.stderr.write('Usage: node poly27-public-check.mjs <language> <.suffice-v10-checks/file>\n'); process.exitCode = 2;}
  else {const result = await runPublicGeneratedCheck({lang, generated}); process.stdout.write(formatPublicResult(result)); process.exitCode = result.exitCode;}
}
