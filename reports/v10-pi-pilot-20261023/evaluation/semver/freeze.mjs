import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
const fileHash = file => hash(fs.readFileSync(file))
const validation = JSON.parse(fs.readFileSync(path.join(here, 'validation.json'), 'utf8'))
const receipts = JSON.parse(fs.readFileSync(path.join(here, 'reference-receipts.json'), 'utf8'))
if (!validation.success || validation.runs.length !== 4) throw new Error('Reference validation did not succeed')
if (fs.existsSync(path.join(here, 'manifest.json'))) throw new Error('Already frozen; refusing to replace manifest')

function tree (root) {
  const files = []
  function visit (dir, prefix = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (['attempts', 'grading'].includes(item.name)) throw new Error('Forbidden directory encountered')
      const relative = prefix + item.name
      const full = path.join(dir, item.name)
      if (item.isDirectory()) visit(full, relative + '/')
      else if (item.isFile()) files.push({ path: relative, sha256: fileHash(full) })
      else throw new Error(`Nonregular file: ${full}`)
    }
  }
  visit(root)
  return { sha256: hash(files.map(file => `${file.sha256}  ${file.path}\n`).join('')), files }
}
const original = tree(path.resolve(here, '../../upstream'))
const trees = {}
const sources = {}
for (const task of ['baseline', 'build-metadata', 'prerelease-subset']) {
  const snapshot = tree(path.join(here, 'references', task, 'src'))
  const sourceMap = new Map(original.files.map(file => [file.path, file.sha256]))
  const changedFiles = snapshot.files.filter(file => sourceMap.get(file.path) !== file.sha256).map(file => file.path)
  const expectedFile = receipts.receipts.find(receipt => receipt.task === task)?.file
  if (task === 'baseline' ? snapshot.sha256 !== original.sha256 :
    changedFiles.length !== 1 || changedFiles[0] !== expectedFile || snapshot.files.length !== original.files.length) {
    throw new Error(`Reference ${task} was not the required exact baseline plus one file`)
  }
  if (expectedFile) {
    const receipt = receipts.receipts.find(receipt => receipt.task === task)
    if (fileHash(path.join(here, 'references', task, 'src', expectedFile)) !== receipt.sha256) {
      throw new Error(`Reference file hash mismatch for ${task}`)
    }
  }
  trees[task] = snapshot
  sources[task] = { path: `references/${task}/src`, treeSha256: snapshot.sha256,
    fileCount: snapshot.files.length, changedFilesFromBaseline: changedFiles }
}
fs.writeFileSync(path.join(here, 'reference-tree-hashes.json'), JSON.stringify({
  algorithm: 'sha256', treeEncoding: 'sorted sha256 + two spaces + relative POSIX path + LF',
  originalBaseline: original, references: trees,
}, null, 2) + '\n')
const artifacts = {}
for (const file of ['grade-semver.mjs', 'prepare-references.mjs', 'validate-references.mjs', 'freeze.mjs',
  'reference-receipts.json', 'reference-tree-hashes.json', 'validation.json']) {
  artifacts[file] = { sha256: fileHash(path.join(here, file)), bytes: fs.statSync(path.join(here, file)).size }
}
for (const run of validation.runs) {
  for (const file of [run.stdoutLog, run.stderrLog]) {
    artifacts[file] = { sha256: fileHash(path.join(here, file)), bytes: fs.statSync(path.join(here, file)).size }
  }
}
const manifest = {
  schema: 1, frozenAt: new Date().toISOString(), evaluator: 'blind-semver-grader',
  invocation: 'node grade-semver.mjs <build-metadata|prerelease-subset> <workspace>',
  moduleLoading: 'createRequire(import.meta.url) requiring absolute workspace/src/index.js',
  dependencies: 'Node built-ins only; standalone grader does not import references or actor-generated oracles',
  exitCodes: { 0: 'all named tests passed', 1: 'one or more named tests failed', 2: 'usage or module-loading failure' },
  blindness: { actorSourcesInspected: false, actorOutputsInspected: false, actorStatusesOrReceiptsInspected: false,
    actorWorkspacesExecuted: false, modelCalls: false,
    inputs: ['original upstream snapshot', 'original public test/public.test.mjs in each fixture',
      'the two exact raw GitHub reference files supplied by the parent'] },
  baseline: { commit: receipts.baselineCommit, version: receipts.baselinePackageVersion, originalTreeSha256: original.sha256 },
  referenceReceipts: receipts.receipts, referenceSources: sources,
  expectedVectorPolicy: 'Explicit booleans, canonical ranges, membership lists, arrays and null/throw expectations in the grader. Every final vector passes the exact pinned reference applied alone to the original baseline. No broad current-version oracle is used.',
  assertionRationale: {
    'prerelease-subset': [
      'The public caret reproduction plus a different tuple and a zero-major caret establish general containment rather than example matching.',
      'Inclusive lower bounds are tested against upper comparators, and inclusive upper bounds against lower comparators; both prerelease bounds also occur together at different tuples.',
      'Matching prerelease tuple permission may be supplied by either domain bound. A missing tuple gate remains excluded unless includePrerelease is true.',
      'Reversed bounds, numeric prerelease ordering, inclusive/exclusive endpoints, -0 upper-bound exception, dominant comparators, tilde/hyphen syntax and OR alternatives exercise the nearby contract.',
      'Ordinary ranges, exact stable versions, contradictory/equal empty intervals, empty-string any, loose parsing, invalid strict input and Range-instance input protect existing options and behavior.',
      'The equality branch has no newly invented prerelease behavior; direct satisfaction checks preserve normal prerelease exclusion.'
    ],
    'build-metadata': [
      'Every syntax named in the public contract has frozen canonical range and positive/negative membership vectors: whitespace comparators, partial/x versions, hyphens, tilde/caret and OR.',
      'Each syntax runs with strict short valid metadata and with the loose public long numeric-tail metadata. The original tuple and all inclusive/exclusive boundaries must survive.',
      'Lengths around the internal safe build boundary plus longer numeric and multi-identifier metadata detect bounded stripping or numeric-tail leakage.',
      'Prerelease-bearing exact/caret/hyphen/OR ranges retain their prerelease fields and default tuple exclusion. includePrerelease and cache option separation are checked explicitly.',
      'The strict long-range expectation was observed on the pinned reference, while the same long string remains rejected by SemVer/valid/parse through their independent 256-character version cap.',
      'Invalid strict grammar, loose zero-padding and prerelease spelling, short SemVer build fields, global comparator stripping and downstream range consumers protect existing behavior.'
    ]
  },
  exclusions: [
    'A proposed standalone <0.0.0-0 subset-of-prerelease-domain assertion failed the pinned reference because of an existing one-sided-bound limitation. It was removed rather than imposing unrelated future behavior; contradictory-bound empty ranges and ignored empty OR branches remain covered.',
    'No attempt to repair unrelated equality/OR-union subset limitations, accept overlong version strings, or use later node-semver releases as an oracle.'
  ],
  developmentAudit: 'pre-freeze-check-01 preserves the initial rejected vector and its validation logs; only final validation.json defines the frozen test suite.',
  validation: { success: validation.success, node: validation.node, runs: validation.runs.map(run => ({
    task: run.task, implementation: run.implementation, exit: run.exit, expectedExit: run.expectedExit,
    ...run.summary, startedAt: run.startedAt, completedAt: run.completedAt,
    stdoutLog: run.stdoutLog, stderrLog: run.stderrLog,
  })) },
  artifacts,
}
fs.writeFileSync(path.join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ frozenAt: manifest.frozenAt,
  graderSha256: artifacts['grade-semver.mjs'].sha256,
  manifestSha256: fileHash(path.join(here, 'manifest.json')),
  references: sources, validation: manifest.validation.runs }, null, 2))
