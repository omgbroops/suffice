import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { readFence, classify, chartSvg, tableHtml, buildDoc, artifactUrl, decodeArtifactUrl, SANDBOX, CSP } from '../shared/artifacts.mjs'
import { cleanArtifactSave } from '../electron/host/validate.mjs'
import { ARTIFACT_PROMPT } from '../electron/host/artifact-prompt.mjs'

const fence = s => readFence(s.split('\n'), 0)

test('readFence: complete, incomplete and nested fences', () => {
  const a = fence('```artifact title="T" type="chart"\n{}\n```\nafter')
  assert.deepEqual([a.info, a.body, a.next, a.complete], ['artifact title="T" type="chart"', ['{}'], 3, true])
  const b = fence('```artifact type="html"\n<p>half')
  assert.equal(b.complete, false)
  assert.deepEqual(b.body, ['<p>half'])
  const c = fence('````artifact type="html"\n```js\nx\n```\n````')
  assert.equal(c.complete, true)
  assert.deepEqual(c.body, ['```js', 'x', '```'])
  const d = fence('```js\n```not a close\nx\n```')
  assert.deepEqual(d.body, ['```not a close', 'x'])
})

test('classify: artifact blocks, the 15 line rule for plain html and svg', () => {
  const x = classify('artifact title="Weekly" type="chart"', '{}', true)
  assert.deepEqual([x.type, x.title], ['chart', 'Weekly'])
  assert.equal(classify('artifact', '<p>', true).type, 'html')
  assert.equal(classify('artifact type="nope"', 'x', true), null)
  const long = Array(15).fill('<p>x</p>').join('\n')
  assert.equal(classify('html', long, true).type, 'html')
  assert.equal(classify('html', long, false), null)
  assert.equal(classify('html', Array(14).fill('x').join('\n'), true), null)
  assert.equal(classify('svg', `<title>Logo</title>\n${long}`, true).title, 'Logo')
  assert.equal(classify('js', long, true), null)
  assert.equal(classify('artifact type="chart"', '{', false).complete, false)
})

test('chartSvg: bars, lines, escaping and invalid specs', () => {
  const spec = { kind: 'bar', x: ['Mon', '<b>'], series: [{ name: 'A&B', values: [3, 5] }] }
  const svg = chartSvg(spec)
  assert.equal((svg.match(/<rect class="bar"/g) ?? []).length, 2)
  assert.ok(svg.includes('&lt;b&gt;') && !svg.includes('<b>'))
  assert.ok(!/#[0-9a-f]{3,6}\b|rgb|hsl/i.test(svg), 'monochrome: no colour literals')
  const line = chartSvg({ kind: 'line', x: [1, 2, 3], series: [{ name: 'a', values: [1, 2, 3] }, { name: 'b', values: [3, 2, 1] }] })
  assert.ok(line.includes('<polyline') && line.includes('class="legend"') && line.includes('stroke-dasharray'))
  assert.ok(chartSvg({ ...spec, kind: 'area' }).includes('<polygon'))
  assert.throws(() => chartSvg({ ...spec, kind: 'pie' }), /kind/)
  assert.throws(() => chartSvg({ x: ['a'], series: [{ values: [1, 2] }] }), /number per x/)
  assert.throws(() => chartSvg({ x: [], series: [] }), /x array/)
  assert.throws(() => chartSvg({ x: ['a'], series: [{ values: ['1'] }] }))
})

test('tableHtml: rows, columns form, escaping, sort script', () => {
  const h = tableHtml([{ a: 1, b: '<i>' }, { a: 2 }])
  assert.ok(h.includes('<th tabindex="0">a</th>') && h.includes('&lt;i&gt;') && h.includes('class="n"'))
  assert.ok(tableHtml({ columns: ['x'], rows: [[1]] }).includes('<td class="n" data-v="1">'))
  assert.throws(() => tableHtml({ rows: 1 }), /rows/)
  assert.ok(buildDoc({ type: 'table', code: '[{"a":1}]' }).includes("th.onclick"))
})

test('buildDoc: CSP, scripts allowed only inline, no app chrome, invalid JSON throws', () => {
  const d = buildDoc({ type: 'html', code: '<script>1</script>' }, { dark: false, id: 'k' })
  assert.ok(d.includes(`content="${CSP.replace(/'/g, '&#39;')}"`))
  assert.match(CSP, /default-src 'none'/)
  assert.match(CSP, /script-src 'unsafe-inline'/)
  assert.match(CSP, /img-src data:/)
  assert.ok(d.includes('color-scheme:light') && d.includes('"k"'))
  assert.throws(() => buildDoc({ type: 'chart', code: 'nope' }))
  assert.equal(SANDBOX, 'allow-scripts')
})

test('artifactUrl round-trips and refuses oversize documents', () => {
  const doc = buildDoc({ type: 'html', code: '<p>café ✓</p>' })
  assert.equal(decodeArtifactUrl(artifactUrl(doc)), doc)
  assert.throws(() => artifactUrl('x'.repeat(1_600_000)), /too large/)
})

test('the iframe element and the app CSP: sandbox is allow-scripts only, nothing renders in the main DOM', async () => {
  const src = await readFile(new URL('../src/components/Artifact.tsx', import.meta.url), 'utf8')
  assert.match(src, /sandbox=\{SANDBOX\}/)
  assert.ok(!/dangerouslySetInnerHTML|srcDoc|allow-same-origin|allow-top-navigation/.test(src))
  const main = await readFile(new URL('../electron/main.mjs', import.meta.url), 'utf8')
  assert.match(main, /nodeIntegration: false/)
  assert.match(main, /'artifacts:save'/)
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /frame-src suffice-artifact:/)
})

test('cleanArtifactSave: shape, name sanitised, size capped', () => {
  assert.deepEqual(cleanArtifactSave({ project: '/p', name: '../a/b:c.html', content: 'x' }), { project: '/p', name: '-a-b-c.html', content: 'x' })
  assert.throws(() => cleanArtifactSave({ project: '/p', name: 'a', content: '' }))
  assert.throws(() => cleanArtifactSave({ project: 1, name: 'a', content: 'x' }))
  assert.throws(() => cleanArtifactSave({ project: '/p', name: 'a', content: 'x'.repeat(5_000_001) }))
  assert.throws(() => cleanArtifactSave(null))
})

test('prompt teaches the syntax and the host passes it to the engine', async () => {
  for (const s of ['artifact title=', 'type="chart"', 'type="table"', 'var(--fg)', 'four backticks']) assert.ok(ARTIFACT_PROMPT.includes(s), s)
  const host = await readFile(new URL('../electron/host/host.mjs', import.meta.url), 'utf8')
  assert.match(host, /appendPrompt: ARTIFACT_PROMPT/)
})
