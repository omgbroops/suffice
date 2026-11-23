// Inline artifacts: parsing fenced blocks and building the documents the sandboxed iframe shows.
// Pure and dependency free so node tests cover it. Nothing here touches the DOM.

export const ARTIFACT_TYPES = ['html', 'svg', 'chart', 'table']
export const MAX_DOC = 1_500_000
const MIN_PLAIN_LINES = 15

/** Reads the fence opening at lines[i] (caller checked it starts with ```). A longer opener only closes on an equal or longer fence, so ```` can wrap ```. */
export function readFence(lines, i) {
  const m = /^(`{3,})(.*)$/.exec(lines[i])
  const ticks = m[1].length
  const body = []
  let j = i + 1
  while (j < lines.length) {
    const c = /^(`{3,})\s*$/.exec(lines[j])
    if (c && c[1].length >= ticks) return { info: m[2].trim(), body, next: j + 1, complete: true }
    body.push(lines[j++])
  }
  return { info: m[2].trim(), body, next: j, complete: false }
}

/** Models sometimes wrap an artifact in an outer ``` / ```markdown fence. Returns the index of the inner artifact
 *  opener when lines[i] is such a wrapper, else -1; the wrapper's stray closing fence is then dropped by the caller. */
export function wrappedArtifact(lines, i) {
  return /^`{3,}\s*(markdown|md|text)?\s*$/i.test(lines[i]) && /^`{3,}\s*artifact\b/i.test(lines[i + 1] ?? '') ? i + 1 : -1
}

/** title="..." type=chart, quotes optional */
export function parseAttrs(s) {
  const out = {}
  for (const m of s.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) out[m[1]] = m[2] ?? m[3] ?? m[4]
  return out
}

/** An artifact block, or null when the fence is an ordinary code block. Incomplete blocks stay pending until closed. */
export function classify(info, code, complete) {
  const word = /^(\w+)/.exec(info)?.[1]?.toLowerCase()
  if (word === 'artifact') {
    const a = parseAttrs(info)
    const type = (a.type ?? 'html').toLowerCase()
    if (!ARTIFACT_TYPES.includes(type)) return null
    return { type, title: a.title?.trim() || DEFAULT_TITLE[type], code, complete }
  }
  if ((word === 'html' || word === 'svg') && complete && code.split('\n').length >= MIN_PLAIN_LINES) {
    return { type: word, title: /<title>([^<]{1,80})<\/title>/i.exec(code)?.[1].trim() || DEFAULT_TITLE[word], code, complete }
  }
  return null
}
const DEFAULT_TITLE = { html: 'Preview', svg: 'Drawing', chart: 'Chart', table: 'Table' }

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const num = v => typeof v === 'number' && Number.isFinite(v)

/** Rounded axis ticks covering [0,max] (and min when negative). */
export function ticks(min, max, want = 5) {
  if (max === min) max = min + 1
  const raw = (max - min) / want
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => s >= raw)
  const out = []
  for (let v = Math.floor(min / step) * step; v < max + step - 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}
const fmt = v => (Math.abs(v) >= 10000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(2)))

/** Monochrome chart: series differ by weight and dash, never by hue. Throws on a bad spec. */
export function chartSvg(spec) {
  const kind = spec?.kind ?? 'bar'
  if (!['bar', 'line', 'area'].includes(kind)) throw new Error('Unknown chart kind.')
  const x = spec.x, series = spec.series
  if (!Array.isArray(x) || !x.length || x.length > 200) throw new Error('Chart needs an x array.')
  if (!Array.isArray(series) || !series.length || series.length > 8) throw new Error('Chart needs 1 to 8 series.')
  for (const s of series) if (!Array.isArray(s?.values) || s.values.length !== x.length || !s.values.every(num)) throw new Error('Each series needs one number per x.')
  const W = 640, H = 300, L = 44, R = 12, T = 14, B = 34
  const all = series.flatMap(s => s.values)
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all)
  const ys = ticks(lo, hi), y0 = ys[0], y1 = ys.at(-1)
  const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0))
  const n = x.length, pw = (W - L - R) / n
  const X = i => L + pw * (i + 0.5)
  const tone = i => [0.9, 0.5, 0.28, 0.7, 0.4, 0.2, 0.6, 0.34][i]
  const dash = i => ['', '5 3', '1.5 3', '8 3 1.5 3', '', '5 3', '1.5 3', ''][i]
  let g = ''
  for (const t of ys) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`
  const every = Math.ceil(n / 12)
  x.forEach((label, i) => { if (i % every === 0) g += `<text class="tick" x="${X(i)}" y="${H - B + 18}" text-anchor="middle">${esc(label)}</text>` })
  g += `<line class="axis" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`
  series.forEach((s, k) => {
    const o = tone(k)
    if (kind === 'bar') {
      const gw = Math.min(pw * 0.7, 56), bw = gw / series.length
      s.values.forEach((v, i) => {
        const top = Math.min(Y(v), Y(0)), h = Math.abs(Y(v) - Y(0))
        g += `<rect class="bar" x="${(X(i) - gw / 2 + k * bw + 0.5).toFixed(2)}" y="${top.toFixed(2)}" width="${Math.max(bw - 1, 1).toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill-opacity="${o}"><title>${esc(`${s.name ?? ''} ${x[i]}: ${v}`.trim())}</title></rect>`
      })
    } else {
      const pts = s.values.map((v, i) => `${X(i).toFixed(2)},${Y(v).toFixed(2)}`)
      if (kind === 'area') g += `<polygon class="area" points="${X(0).toFixed(2)},${Y(0)} ${pts.join(' ')} ${X(n - 1).toFixed(2)},${Y(0)}" fill-opacity="${(o * 0.16).toFixed(3)}"/>`
      g += `<polyline class="line" points="${pts.join(' ')}" stroke-opacity="${o}"${dash(k) ? ` stroke-dasharray="${dash(k)}"` : ''}/>`
      s.values.forEach((v, i) => { g += `<circle class="dot" cx="${X(i).toFixed(2)}" cy="${Y(v).toFixed(2)}" r="2.5" fill-opacity="${o}"><title>${esc(`${s.name ?? ''} ${x[i]}: ${v}`.trim())}</title></circle>` })
    }
  })
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, k) => `<span><i style="opacity:${tone(k)}"></i>${esc(s.name ?? `Series ${k + 1}`)}</span>`).join('')}</div>` : ''
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title ?? 'Chart')}">${g}</svg>${legend}`
}

/** Sortable table markup from an array of objects, or {columns, rows}. Throws on anything else. */
export function tableHtml(spec) {
  let cols, rows
  if (Array.isArray(spec) && spec.every(r => r && typeof r === 'object' && !Array.isArray(r))) {
    cols = [...new Set(spec.flatMap(r => Object.keys(r)))]
    rows = spec.map(r => cols.map(c => r[c] ?? ''))
  } else if (Array.isArray(spec?.columns) && Array.isArray(spec?.rows) && spec.rows.every(Array.isArray)) {
    cols = spec.columns
    rows = spec.rows
  } else throw new Error('Table needs rows.')
  if (!cols.length || cols.length > 30 || rows.length > 2000) throw new Error('Table is too large.')
  const cell = v => `<td${typeof v === 'number' ? ' class="n"' : ''} data-v="${esc(v)}">${esc(v)}</td>`
  return `<table><thead><tr>${cols.map(c => `<th tabindex="0">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map((_, i) => cell(r[i] ?? '')).join('')}</tr>`).join('')}</tbody></table>`
}

export const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"

const BASE_CSS = dark => `:root{color-scheme:${dark ? 'dark' : 'light'};--fg:${dark ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.86)'};--muted:${dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)'};--line:${dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.09)'};--fill:${dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)'}}
html,body{margin:0}body{padding:14px 16px;font:13px/1.5 system-ui,-apple-system,'Helvetica Neue',sans-serif;color:var(--fg);background:transparent}
svg.chart{display:block;width:100%;height:auto}.grid{stroke:var(--line)}.axis{stroke:var(--muted);stroke-opacity:.5}.tick{fill:var(--muted);font-size:11px}.bar,.dot{fill:var(--fg)}.line{fill:none;stroke:var(--fg);stroke-width:1.75;stroke-linejoin:round}.area{fill:var(--fg)}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:8px;color:var(--muted);font-size:12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--fg);margin-right:6px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--muted);font-weight:500;cursor:pointer;user-select:none}th[data-d=a]:after{content:' \\2191'}th[data-d=d]:after{content:' \\2193'}td.n{text-align:right}tr:last-child td{border-bottom:0}`

// Reports the content height to the parent; the parent ignores any message not from its own iframe.
const REPORT = id => `<script>(function(){var s=function(){parent.postMessage({suffice_artifact:${JSON.stringify(id)},h:Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0))},'*')};addEventListener('load',s);if(window.ResizeObserver)new ResizeObserver(s).observe(document.documentElement);s()})()</script>`
const SORT = `<script>document.querySelectorAll('th').forEach(function(th,c){var go=function(){var d=th.dataset.d==='a'?'d':'a';document.querySelectorAll('th').forEach(function(t){delete t.dataset.d});th.dataset.d=d;var b=document.querySelector('tbody'),r=[].slice.call(b.rows);r.sort(function(x,y){var a=x.cells[c].dataset.v,z=y.cells[c].dataset.v,m=a!==''&&z!==''&&!isNaN(a)&&!isNaN(z);var k=m?a-z:a.localeCompare(z,undefined,{numeric:true});return d==='a'?k:-k});r.forEach(function(e){b.appendChild(e)})};th.onclick=go;th.onkeydown=function(e){if(e.key==='Enter')go()}})</script>`

/** The complete document for the iframe. Throws when a chart or table spec is invalid. */
export function buildDoc({ type, code }, { dark = true, id = '' } = {}) {
  let body
  if (type === 'chart') body = chartSvg(JSON.parse(code)) + REPORT(id)
  else if (type === 'table') body = tableHtml(JSON.parse(code)) + SORT + REPORT(id)
  else if (type === 'svg') body = `<style>svg{max-width:100%;height:auto}</style>${code}${REPORT(id)}`
  else body = code + REPORT(id)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(CSP)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS(dark)}</style></head><body>${body}</body></html>`
}

/** The iframe's src: the document rides in the URL, so the main process keeps no state. */
export function artifactUrl(doc) {
  if (doc.length > MAX_DOC) throw new Error('Artifact is too large.')
  const bytes = new TextEncoder().encode(doc)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `suffice-artifact://doc/?d=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}
export const decodeArtifactUrl = u => Buffer.from(new URL(u).searchParams.get('d') ?? '', 'base64url').toString('utf8')

/** The attribute string for the iframe. Scripts only: no same-origin, no top navigation, no popups, no forms. */
export const SANDBOX = 'allow-scripts'

export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'artifact'
export const saveExt = type => (type === 'html' || type === 'svg' ? type : 'html')
