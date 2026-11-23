// Inline artifacts: parsing fenced blocks and building the documents the sandboxed iframe shows.
// Pure and dependency free so node tests cover it. Nothing here touches the DOM; the kit (./kit) runs in the iframe.
import { kitHead, scriptJson } from './kit/index.mjs'

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
export const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"

// Reports the content height to the parent; the parent ignores any message not from its own iframe.
const REPORT = id => `<script>(function(){var s=function(){parent.postMessage({suffice_artifact:${JSON.stringify(id)},h:Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0))},'*')};addEventListener('load',s);if(window.ResizeObserver)new ResizeObserver(s).observe(document.documentElement);s()})()</script>`
/** The complete document for the iframe. Throws when a chart or table spec is invalid. */
export function buildDoc({ type, code }, { dark = true, id = '' } = {}) {
  let body
  // chart and table specs are parsed here so a broken spec shows the code view with the reason
  if (type === 'chart') body = `<div id="sx-a"></div><script>sx.chart('#sx-a',${scriptJson(JSON.parse(code))})</script>`
  else if (type === 'table') {
    const spec = JSON.parse(code)
    if (!Array.isArray(spec) && !(Array.isArray(spec?.columns) && Array.isArray(spec?.rows))) throw new Error('Table needs rows.')
    body = `<div id="sx-a"></div><script>sx.table('#sx-a',${scriptJson(spec)})</script>`
  } else if (type === 'svg') body = `<style>svg{max-width:100%;height:auto}</style>${code}`
  else body = code
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(CSP)}"><meta name="viewport" content="width=device-width,initial-scale=1">${kitHead(dark, id)}</head><body>${body}${REPORT(id)}</body></html>`
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
