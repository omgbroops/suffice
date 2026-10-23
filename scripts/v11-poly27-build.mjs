// Reuse the pinned, warmed V10 actor toolchain. Only public runtime files enter this overlay.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runtimeFiles as baselineRuntimeFiles} from './poly27-build.mjs';
import {bindImageCode} from './poly27-bench.mjs';
import {hash} from '../src/v9/workspace.mjs';

export const runtimeFiles = [...new Set([...baselineRuntimeFiles,
  'src/v11/config.mjs', 'src/v11/controller.mjs', 'src/v11/public-context.mjs',
  'scripts/v11-poly27-container-entry.mjs'])].sort();

export const graderRuntimeFiles = ['src/v9/process.mjs', 'scripts/poly27-public-check.mjs', 'scripts/poly27-grader-entry.mjs'];
export const stageBuild = (outputDirectory, baseImage, options = {}) => stageOverlay(outputDirectory, baseImage, {...options, kind: 'actor'});
export const stageGraderBuild = (outputDirectory, baseImage, options = {}) => stageOverlay(outputDirectory, baseImage, {...options, kind: 'grader'});
async function stageOverlay(outputDirectory, baseImage, {probe = bindImageCode, kind}) {
  if (typeof baseImage !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(baseImage)) throw Error('Overlay base requires an immutable image ID');
  const root = resolve(import.meta.dirname, '..'), output = resolve(outputDirectory), context = join(output, kind === 'actor' ? 'v11-build-context' : 'v11-grader-build-context');
  // A different lockfile requires rebuilding dependencies instead of reusing this image.
  const dependencyBinding = await probe(baseImage, ['package-lock.json']);
  await mkdir(context, {recursive: true});
  const files = [];
  for (const path of [...(kind === 'actor' ? runtimeFiles : graderRuntimeFiles), 'package.json', 'package-lock.json'].sort()) {
    const bytes = await readFile(join(root, path)), destination = join(context, 'runtime', path);
    await mkdir(dirname(destination), {recursive: true}); await writeFile(destination, bytes);
    files.push({path, sha256: hash(bytes), bytes: bytes.length});
  }
  const entry = kind === 'actor' ? 'v11-poly27-container-entry.mjs' : 'poly27-grader-entry.mjs';
  // BuildKit treats a raw local image ID as a registry repository. Bind this local alias to
  // the verified full ID immediately before building; the immutable identity stays in the receipt.
  const baseTag = `suffice-v11-poly27-base-${kind}:${baseImage.slice(7)}`;
  const dockerfile = `FROM ${baseTag}\nLABEL com.suffice.overlay-base-image="${baseImage}"\nCOPY runtime/ /opt/suffice/\nUSER node\nWORKDIR /work\nENTRYPOINT ["node", "/opt/suffice/scripts/${entry}"]\n`;
  await writeFile(join(context, 'Dockerfile'), dockerfile);
  const receipt = {at: new Date().toISOString(), kind, context, baseImage, baseTag, dependencyBinding, files,
    dockerfileSha256: hash(dockerfile), runtimeHash: hash(JSON.stringify(files)),
    separation: 'Public runtime and dependency manifests only. No evaluators, reference solutions, fixtures, results or credentials.'};
  await writeFile(join(output, kind === 'actor' ? 'v11-runtime-stage.json' : 'v11-grader-stage.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const action = process.argv[4] === '--grader' ? stageGraderBuild : stageBuild;
  if (process.argv.length > 5 || process.argv[4] && process.argv[4] !== '--grader') throw Error('Usage: node scripts/v11-poly27-build.mjs <cohort-root> <base-image-sha256> [--grader]');
  action(process.argv[2], process.argv[3]).then(result => console.log(JSON.stringify({context: result.context, baseImage: result.baseImage, baseTag: result.baseTag, runtimeHash: result.runtimeHash})))
    .catch(error => {console.error(error.message); process.exitCode = 1;});
}
