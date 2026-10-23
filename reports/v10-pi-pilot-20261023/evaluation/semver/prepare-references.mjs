import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const baseline = path.resolve(here, '../../upstream')
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
const specs = [
  { task: 'prerelease-subset', commit: '5f3ca133e040210b6ea80c350a1d61d9da02e722', file: 'ranges/subset.js' },
  { task: 'build-metadata', commit: '17aa702d91166472b197a2ea768f085083bee2e4', file: 'classes/range.js' },
]
const receipts = []
for (const spec of specs) {
  const url = `https://raw.githubusercontent.com/npm/node-semver/${spec.commit}/${spec.file}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`)
  const source = Buffer.from(await response.arrayBuffer())
  const download = path.join(here, 'reference-files', spec.task, spec.file)
  fs.mkdirSync(path.dirname(download), { recursive: true })
  fs.writeFileSync(download, source)
  receipts.push({ ...spec, url, fetchedAt: new Date().toISOString(), status: response.status,
    sha256: hash(source), bytes: source.length, etag: response.headers.get('etag'),
    baselineSha256: hash(fs.readFileSync(path.join(baseline, spec.file))) })
}
for (const task of ['baseline', ...specs.map(spec => spec.task)]) {
  const destination = path.join(here, 'references', task, 'src')
  if (fs.existsSync(destination)) throw new Error(`Refusing to replace ${destination}`)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(baseline, destination, { recursive: true })
  const spec = specs.find(spec => spec.task === task)
  if (spec) fs.copyFileSync(path.join(here, 'reference-files', spec.task, spec.file), path.join(destination, spec.file))
}
fs.writeFileSync(path.join(here, 'reference-receipts.json'), JSON.stringify({
  baselineCommit: 'efa4be6096c1f9b77d9d27d6132f6220c43b4e31',
  baselinePackageVersion: JSON.parse(fs.readFileSync(path.join(baseline, 'package.json'), 'utf8')).version,
  createdAt: new Date().toISOString(), receipts,
}, null, 2) + '\n')
console.log(JSON.stringify(receipts, null, 2))
