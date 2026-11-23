import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { readFence, classify, buildDoc, artifactUrl, decodeArtifactUrl, SANDBOX, CSP } from '../shared/artifacts.mjs'
import { kitCore } from '../shared/kit/core.mjs'
import { KINDS } from '../shared/kit/index.mjs'
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

// The kit runs in the iframe; its pure parts run here against a stub window.
const kit = () => {
  const w = { document: { readyState: 'complete', querySelectorAll: () => [] }, matchMedia: () => ({ matches: false }) }
  kitCore(w, 'id')
  return w.sx
}

test('kit: ticks, monotone curve, CSV, series shapes, folding', () => {
  const sx = kit()
  assert.deepEqual(sx.ticks(0, 9), [0, 2, 4, 6, 8, 10])
  const d = sx.path([[0, 10], [10, 0], [20, 0], [30, 10]], 'smooth')
  assert.match(d, /^M0\.00,10\.00C/)
  // monotone: the flat middle segment never dips below 0 (no overshoot past the data)
  const ys = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => +m[2])
  assert.ok(Math.min(...ys) >= 0, d)
  assert.deepEqual(sx.csv('a,b\n1,"x, y"\n2,"say ""hi"""\n'), { columns: ['a', 'b'], rows: [[1, 'x, y'], [2, 'say "hi"']] })
  assert.deepEqual(sx.csv('a\tb\r\n3\t4').rows, [[3, 4]])
  assert.deepEqual(sx.series({ rows: [{ m: 'Jan', a: 1, b: 2 }], x: 'm' }), { x: ['Jan'], series: [{ name: 'a', values: [1] }, { name: 'b', values: [2] }] })
  assert.throws(() => sx.series({ x: ['a'], series: [{ values: [1, 2] }] }), /number per x/)
  const f = sx.fold(Array.from({ length: 10 }, (_, i) => ({ label: `s${i}`, value: i + 1 })))
  assert.equal(f.length, 8)
  assert.equal(f[7].label, 'Other')
  assert.equal(f[7].value, 1 + 2 + 3)
  assert.equal(sx.fmt(12500), '12.5k')
  assert.equal(sx.fmt(0.5, '%'), '0.5%')
})

test('kit: every kind is registered in the page, chart JSON cannot close the script', () => {
  const d = buildDoc({ type: 'chart', code: JSON.stringify({ kind: 'bar', x: ['</script><b>'], series: [{ values: [1] }] }) })
  for (const k of Object.keys(KINDS)) assert.ok(d.includes(`sx.kind("${k}",`), k)
  assert.ok(!d.includes('</script><b>'))
  assert.ok(d.includes('\\u003c/script>'))
  assert.throws(() => buildDoc({ type: 'chart', code: 'nope' }))
  assert.throws(() => buildDoc({ type: 'table', code: '{"rows":1}' }), /rows/)
  assert.ok(buildDoc({ type: 'table', code: '[{"a":1}]' }).includes("sx.table('#sx-a',[{"))
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
  for (const s of ['artifact title=', 'type="chart"', 'type="table"', 'var(--fg)', 'four backticks', 'data-chart', 'data-reply', 'sx.drop']) assert.ok(ARTIFACT_PROMPT.includes(s), s)
  const host = await readFile(new URL('../electron/host/host.mjs', import.meta.url), 'utf8')
  assert.match(host, /appendPrompt: ARTIFACT_PROMPT/)
})

test('an artifact wrapped in an outer ``` or ```markdown fence is still found, and the stray closer is not a block', async () => {
  const { wrappedArtifact, readFence, classify } = await import('../shared/artifacts.mjs')
  for (const outer of ['```', '```markdown']) {
    const lines = [outer, '```artifact type=chart title="W"', '{"kind":"bar","x":["a"],"series":[{"name":"n","values":[1]}]}', '```', '```']
    const at = wrappedArtifact(lines, 0)
    assert.equal(at, 1)
    const f = readFence(lines, at)
    assert.equal(classify(f.info, f.body.join('\n'), f.complete).type, 'chart')
    assert.equal(f.next, 4)
    assert.ok(/^`{3,}\s*$/.test(lines[f.next]))
  }
  assert.equal(wrappedArtifact(['```python', '```artifact type=html'], 0), -1)
  assert.equal(wrappedArtifact(['```', 'print(1)', '```'], 0), -1)
})
