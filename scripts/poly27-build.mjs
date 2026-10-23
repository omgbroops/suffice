// Stage only public runtime/dependency inputs; no graders, references or auth enter the image.
import {readFile, writeFile, mkdir, copyFile, cp} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from '../src/v9/workspace.mjs';
export const runtimeFiles = [
  'src/runtime.mjs', 'src/workspace.mjs', 'src/symbol-navigation.mjs', 'src/tool-observations.mjs',
  'src/v9/config.mjs', 'src/v9/checks.mjs', 'src/v9/process.mjs', 'src/v9/workspace.mjs',
  'src/v10/config.mjs', 'src/v10/controller.mjs', 'src/v10/tools.mjs', 'src/v10/pi.mjs',
  'src/bench/native-codex.mjs', 'scripts/poly27-container-entry.mjs', 'scripts/poly27-public-check.mjs', 'scripts/poly27-proxy.mjs',
];
export async function stageBuild(outputDirectory, nativeArchive, {toolchainOnly = false} = {}) {
  const root = resolve(import.meta.dirname, '..'), output = resolve(outputDirectory), context = join(output, 'build-context');
  await mkdir(context, {recursive: true});
  const digest = hash(await readFile(resolve(nativeArchive)));
  if (digest !== '3ec55053109608d5038f7e50750f7d25f768dfd740fef071aa710e2559b63aac') throw Error('Pinned native package SHA256 differs');
  await copyFile(resolve(nativeArchive), join(context, 'codex.tar.gz'));
  for (const path of ['package.json', 'package-lock.json']) await copyFile(join(root, path), join(context, path));
  await copyFile(join(root, 'containers/poly27/Dockerfile'), join(context, 'Dockerfile'));
  const js = JSON.parse(await readFile(join(output, 'fixtures/javascript_alphametics/alphametics/package.json')));
  await writeFile(join(context, 'bench-package.json'), JSON.stringify({name: 'poly27-offline-dependencies', private: true, devDependencies: js.devDependencies}, null, 2) + '\n');
  const gradle = join(context, 'gradle-deps'); await mkdir(gradle, {recursive: true});
  await copyFile(join(output, 'fixtures/java_satellite/satellite/build.gradle'), join(gradle, 'build.gradle'));
  await writeFile(join(gradle, 'cache.gradle'), `allprojects { afterEvaluate { tasks.register('cacheBenchmarkDependencies') { doLast { configurations.findAll { it.canBeResolved }.each { it.resolve() } } } } }\n`);
  for (const name of ['decimal', 'pig-latin']) {
    const destination = join(context, 'rust-deps', name); await mkdir(join(destination, 'src'), {recursive: true});
    for (const file of ['Cargo.toml', 'Cargo.lock']) await copyFile(join(output, `fixtures/rust_${name}/${name}`, file), join(destination, file));
    await writeFile(join(destination, 'src/lib.rs'), '// Dependency warmup only; no exercise code or tests.\n');
  }
  const files = [];
  if (!toolchainOnly) for (const path of runtimeFiles) {
    const bytes = await readFile(join(root, path));
    const target = join(context, 'runtime', path); await mkdir(dirname(target), {recursive: true}); await writeFile(target, bytes);
    files.push({path, sha256: hash(bytes), bytes: bytes.length});
  }
  if (!toolchainOnly) for (const path of ['src/v9/process.mjs', 'scripts/poly27-public-check.mjs', 'scripts/poly27-grader-entry.mjs']) {
    const target = join(context, 'grader-runtime', path); await mkdir(dirname(target), {recursive: true}); await copyFile(join(root, path), target);
  }
  const receipt = {at: new Date().toISOString(), context, nativeArchiveSha256: digest, files, runtimeHash: hash(JSON.stringify(files))};
  await writeFile(join(output, toolchainOnly ? 'toolchain-stage.json' : 'runtime-stage.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) stageBuild(process.argv[2], process.argv[3], {toolchainOnly: process.argv.includes('--toolchain-only')}).then(r => console.log(JSON.stringify(r))).catch(e => {console.error(e); process.exitCode = 1;});
