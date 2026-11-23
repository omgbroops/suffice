// The artifact kit: a small runtime every artifact page gets, so whatever the model draws (charts, forms, choices,
// drop zones, plain HTML) comes out in the app's look without the model styling it.
// kitCore runs INSIDE the sandboxed iframe via kitCore.toString(): it must stay self-contained (no imports, no
// references to this module's scope). Chart kinds live in other files under the same rule.

/* eslint-disable no-var */
export function kitCore(w, id) {
  var d = w.document, NS = 'http://www.w3.org/2000/svg'
  var kinds = {}
  var sx = (w.sx = { id: id })
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches
  sx.reduce = reduce

  // ---- dom helpers
  var $ = function (t) { return typeof t === 'string' ? d.querySelector(t) : t }
  sx.$ = $
  var mctx
  /** Rendered width of a tick label (11 px in the page font), measured on a canvas. */
  sx.textW = function (s, px) {
    if (mctx == null) try { mctx = d.createElement('canvas').getContext('2d') || false } catch (e) { mctx = false }
    if (!mctx) return String(s).length * 6.4 * (px || 11) / 11
    mctx.font = (px || 11) + 'px ' + w.getComputedStyle(d.body).fontFamily
    return mctx.measureText(String(s)).width
  }
  sx.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  sx.el = function (tag, attrs, parent) {
    var e = d.createElementNS(NS, tag)
    for (var k in attrs || {}) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k])
    if (parent) parent.appendChild(e)
    return e
  }
  sx.h = function (tag, cls, parent, text) {
    var e = d.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    if (parent) parent.appendChild(e)
    return e
  }
  /** An svg sized by viewBox inside a fresh figure; returns { fig, svg } */
  sx.svg = function (host, W, H, label) {
    var fig = sx.h('figure', 'sx-fig', host)
    var svg = sx.el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label || 'Chart', class: 'sx-svg' }, fig)
    return { fig: fig, svg: svg }
  }

  // ---- colour: categorical in fixed order (never cycled), sequential one hue, diverging blue-grey-red
  sx.color = function (i) { return 'var(--c' + ((i % 8) + 1) + ')' }
  /** one series: the first hue; several: fixed order */
  sx.ink = function (k, n, own) { return n === 1 ? own || 'var(--c1)' : sx.color(k) }
  sx.seq = function (t) {
    t = Math.max(0, Math.min(1, t))
    return 'color-mix(in oklab, var(--seq-hi) ' + Math.round(t * 100) + '%, var(--seq-lo))'
  }
  sx.div = function (t) {
    t = Math.max(-1, Math.min(1, t))
    return t < 0 ? 'color-mix(in oklab, var(--div-neg) ' + Math.round(-t * 100) + '%, var(--div-mid))' : 'color-mix(in oklab, var(--div-pos) ' + Math.round(t * 100) + '%, var(--div-mid))'
  }

  // ---- numbers and scales
  sx.ticks = function (min, max, want) {
    want = want || 5
    if (max === min) max = min + 1
    var raw = (max - min) / want, pow = Math.pow(10, Math.floor(Math.log10(raw)))
    var step = [1, 2, 2.5, 5, 10].map(function (f) { return f * pow }).find(function (s) { return s >= raw })
    var out = []
    for (var v = Math.floor(min / step) * step; v < max + step - 1e-9; v += step) out.push(+v.toFixed(10))
    return out
  }
  sx.fmt = function (v, unit) {
    if (typeof v !== 'number') return String(v)
    var a = Math.abs(v), s
    if (a >= 1e9) s = +(v / 1e9).toFixed(1) + 'B'
    else if (a >= 1e6) s = +(v / 1e6).toFixed(1) + 'M'
    else if (a >= 1e4) s = +(v / 1e3).toFixed(1) + 'k'
    else s = String(+v.toFixed(a < 1 ? 3 : 2))
    return unit === '%' ? s + '%' : unit === '$' ? '$' + s : unit ? s + ' ' + unit : s
  }
  sx.lin = function (d0, d1, r0, r1) {
    var f = function (v) { return d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0) }
    f.inv = function (p) { return d0 + ((p - r0) / (r1 - r0)) * (d1 - d0) }
    return f
  }
  sx.num = function (v) { return typeof v === 'number' && isFinite(v) }
  sx.need = function (ok, msg) { if (!ok) throw new Error(msg) }
  /** {x, series:[{name, values}]} | {rows:[{..}], x:'col', y:['col']} -> {x, series} */
  sx.series = function (spec) {
    if (Array.isArray(spec.rows) && typeof spec.x === 'string') {
      var ys = [].concat(spec.y || Object.keys(spec.rows[0] || {}).filter(function (k) { return k !== spec.x }))
      return { x: spec.rows.map(function (r) { return r[spec.x] }), series: ys.map(function (k) { return { name: k, values: spec.rows.map(function (r) { return +r[k] }) } }) }
    }
    sx.need(Array.isArray(spec.x) && spec.x.length, 'Chart needs an x array.')
    sx.need(Array.isArray(spec.series) && spec.series.length, 'Chart needs a series array.')
    spec.series.forEach(function (s) { sx.need(Array.isArray(s.values) && s.values.length === spec.x.length && s.values.every(sx.num), 'Each series needs one number per x.') })
    return { x: spec.x, series: spec.series }
  }

  /** SVG path through points [[x,y]]: 'smooth' = monotone cubic (never overshoots the data), 'step', or 'linear' */
  sx.path = function (p, curve) {
    if (!p.length) return ''
    var s = 'M' + p[0][0].toFixed(2) + ',' + p[0][1].toFixed(2)
    if (curve === 'step') { for (var i = 1; i < p.length; i++) { var mx = (p[i - 1][0] + p[i][0]) / 2; s += 'H' + mx.toFixed(2) + 'V' + p[i][1].toFixed(2) + 'H' + p[i][0].toFixed(2) } return s }
    if (curve === 'linear' || p.length < 3) { for (var j = 1; j < p.length; j++) s += 'L' + p[j][0].toFixed(2) + ',' + p[j][1].toFixed(2); return s }
    var n = p.length, dx = [], m = [], t = []
    for (var k = 0; k < n - 1; k++) { dx[k] = p[k + 1][0] - p[k][0]; m[k] = (p[k + 1][1] - p[k][1]) / (dx[k] || 1) }
    t[0] = m[0]; t[n - 1] = m[n - 2]
    for (var q = 1; q < n - 1; q++) t[q] = m[q - 1] * m[q] <= 0 ? 0 : (3 * (dx[q - 1] + dx[q])) / ((2 * dx[q] + dx[q - 1]) / m[q - 1] + (dx[q] + 2 * dx[q - 1]) / m[q])
    for (var z = 0; z < n - 1; z++) {
      var h = dx[z] / 3
      s += 'C' + (p[z][0] + h).toFixed(2) + ',' + (p[z][1] + h * t[z]).toFixed(2) + ' ' + (p[z + 1][0] - h).toFixed(2) + ',' + (p[z + 1][1] - h * t[z + 1]).toFixed(2) + ' ' + p[z + 1][0].toFixed(2) + ',' + p[z + 1][1].toFixed(2)
    }
    return s
  }
  /** A bar whose data end is rounded and whose baseline end is square. dir: 'up' | 'down' | 'right' | 'left' */
  sx.barPath = function (x, y, w, h, r, dir) {
    r = Math.max(0, Math.min(r, w / 2, h / 2))
    if (dir === 'down') return 'M' + x + ',' + y + 'H' + (x + w) + 'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + (x + r) + 'Q' + x + ',' + (y + h) + ' ' + x + ',' + (y + h - r) + 'Z'
    if (dir === 'right') return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + x + 'Z'
    if (dir === 'left') return 'M' + (x + w) + ',' + y + 'H' + (x + r) + 'Q' + x + ',' + y + ' ' + x + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'H' + (x + w) + 'Z'
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'
  }
  /** Fold slices past the 8 categorical slots into "Other" (a 9th hue is never generated). */
  sx.fold = function (items, max) {
    max = max || 8
    if (items.length <= max) return items
    var keep = items.slice().sort(function (a, b) { return b.value - a.value }), head = keep.slice(0, max - 1)
    head.push({ label: 'Other', value: keep.slice(max - 1).reduce(function (a, b) { return a + b.value }, 0), other: true })
    return head
  }

  // ---- tooltip: one floating card, follows the pointer, flips at the edges
  var tip
  sx.tip = function (html, cx, cy) {
    if (!tip) { tip = sx.h('div', 'sx-tip', d.body); tip.setAttribute('role', 'tooltip') }
    if (html == null) { tip.classList.remove('is-on'); return }
    tip.innerHTML = html
    tip.classList.add('is-on')
    var r = tip.getBoundingClientRect(), vw = d.documentElement.clientWidth
    var x = cx + 14, y = cy + 14
    if (x + r.width > vw - 6) x = cx - r.width - 14
    if (y + r.height > w.innerHeight - 6) y = Math.max(6, cy - r.height - 14)
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y + w.scrollY) + 'px)'
  }
  /** hover rows: [[label, value, colour?]] */
  sx.tipRows = function (title, rows) {
    return (title != null ? '<b>' + sx.esc(title) + '</b>' : '') + rows.map(function (r) {
      return '<div class="sx-tip-row">' + (r[2] ? '<i style="background:' + r[2] + '"></i>' : '') + '<span>' + sx.esc(r[0]) + '</span><em>' + sx.esc(r[1]) + '</em></div>'
    }).join('')
  }
  sx.hover = function (node, html) {
    node.classList.add('sx-hit')
    node.addEventListener('pointermove', function (e) { sx.tip(typeof html === 'function' ? html() : html, e.clientX, e.clientY) })
    node.addEventListener('pointerleave', function () { sx.tip(null) })
  }

  // ---- legend: always for 2+ series; swatch + name, text stays in ink
  sx.legend = function (host, names, shape) {
    if (names.length < 2) return
    var l = sx.h('div', 'sx-legend', host)
    names.forEach(function (n, i) {
      var s = sx.h('span', '', l)
      var sw = sx.h('i', shape === 'line' ? 'is-line' : '', s)
      sw.style.background = sx.color(i)
      sx.h('span', '', s, n)
    })
  }

  // ---- cartesian frame shared by line, area, bar, scatter...
  // opts: { x: labels[] (band) | {min,max} (linear), y: {min,max}, unit, W, H, horizontal }
  sx.frame = function (host, opts) {
    var W = opts.W || sx.W || 640, H = opts.H || (W < 420 ? 220 : 260)
    var L = opts.L != null ? opts.L : 44, R = opts.R != null ? opts.R : 14, T = 12, B = opts.B != null ? opts.B : 30
    var s = sx.svg(host, W, H, opts.label)
    var svg = s.svg
    var ys = sx.ticks(opts.y.min, opts.y.max, opts.yTicks || 5)
    var Y = sx.lin(ys[0], ys[ys.length - 1], H - B, T)
    var grid = sx.el('g', { class: 'sx-grid' }, svg)
    ys.forEach(function (t) {
      sx.el('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t) }, grid)
      var tx = sx.el('text', { class: 'sx-tick', x: L - 8, y: Y(t) + 4, 'text-anchor': 'end' }, grid)
      tx.textContent = sx.fmt(t, opts.unit)
    })
    var X, bw = 0, xs = null
    if (Array.isArray(opts.x)) {
      var n = opts.x.length, pw = (W - L - R) / n
      bw = pw
      X = function (i) { return L + pw * (i + 0.5) }
      // thin labels only as far as the widest one needs, plus a 10 px gap
      var need = Math.max.apply(null, opts.x.map(function (s) { return sx.textW(s) })) + 10
      var every = Math.max(1, Math.ceil(need / pw))
      opts.x.forEach(function (lab, i) {
        if (i % every) return
        var t = sx.el('text', { class: 'sx-tick', x: X(i), y: H - B + 18, 'text-anchor': 'middle' }, grid)
        t.textContent = String(lab)
      })
    } else {
      xs = sx.ticks(opts.x.min, opts.x.max, opts.xTicks || 6)
      X = sx.lin(xs[0], xs[xs.length - 1], L, W - R)
      xs.forEach(function (t) {
        sx.el('line', { class: 'sx-vgrid', x1: X(t), x2: X(t), y1: T, y2: H - B }, grid)
        var tx = sx.el('text', { class: 'sx-tick', x: X(t), y: H - B + 18, 'text-anchor': 'middle' }, grid)
        tx.textContent = sx.fmt(t, opts.xUnit)
      })
    }
    var zero = Math.max(ys[0], Math.min(0, ys[ys.length - 1]))
    sx.el('line', { class: 'sx-axis', x1: L, x2: W - R, y1: Y(zero), y2: Y(zero) }, svg)
    if (opts.yLabel) { var yl = sx.el('text', { class: 'sx-axis-label', x: L, y: T - 2 }, svg); yl.textContent = opts.yLabel }
    return { fig: s.fig, svg: svg, X: X, Y: Y, W: W, H: H, L: L, R: R, T: T, B: B, bw: bw, zero: zero }
  }
  /** Line/area crosshair: one hit strip per x index shows every series at that x. */
  sx.crosshair = function (f, x, series, unit, marks) {
    var line = sx.el('line', { class: 'sx-cross', y1: f.T, y2: f.H - f.B, x1: 0, x2: 0, visibility: 'hidden' }, f.svg)
    var n = x.length, step = (f.W - f.L - f.R) / n
    var hit = sx.el('rect', { x: f.L, y: f.T, width: f.W - f.L - f.R, height: f.H - f.T - f.B, fill: 'transparent', class: 'sx-hit' }, f.svg)
    var last = -1
    hit.addEventListener('pointermove', function (e) {
      var r = f.svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * f.W
      var i = Math.max(0, Math.min(n - 1, Math.floor((px - f.L) / step)))
      line.setAttribute('x1', f.X(i)); line.setAttribute('x2', f.X(i)); line.setAttribute('visibility', 'visible')
      if (marks && last !== i) { marks.forEach(function (m) { m.forEach(function (c, j) { c.classList.toggle('is-on', j === i) }) }); last = i }
      sx.tip(sx.tipRows(x[i], series.map(function (s, k) { return [s.name || 'Value', sx.fmt(s.values[i], unit), series.length > 1 || s.color ? (s.color || sx.color(k)) : null] })), e.clientX, e.clientY)
    })
    hit.addEventListener('pointerleave', function () { line.setAttribute('visibility', 'hidden'); sx.tip(null); if (marks) marks.forEach(function (m) { m.forEach(function (c) { c.classList.remove('is-on') }) }); last = -1 })
  }
  /** Staggered entrance: every element gets the class and a delay */
  sx.enter = function (nodes, cls, gap) {
    if (reduce) return
    nodes.forEach(function (n, i) { n.classList.add(cls); n.style.animationDelay = Math.round(i * (gap == null ? 24 : gap)) + 'ms' })
  }

  // ---- registry
  sx.kind = function (name, fn) { kinds[name] = fn }
  sx.kinds = function () { return Object.keys(kinds) }
  sx.chart = function (target, spec) {
    var host = $(target)
    if (!host) return
    // drawn at the container's real width so text stays 11-12px; redrawn when that width changes (a tab opening)
    var draw = function () {
      var width = Math.floor(host.clientWidth)
      if (!width) return
      host._sxw = width
      sx.W = Math.max(260, width)
      host.innerHTML = ''
      try {
        var kind = (spec && spec.kind) || 'bar'
        sx.need(kinds[kind], 'Unknown chart kind "' + kind + '". Kinds: ' + Object.keys(kinds).join(', ') + '.')
        if (spec.title) sx.h('div', 'sx-title', host, spec.title)
        if (spec.subtitle) sx.h('div', 'sx-sub', host, spec.subtitle)
        kinds[kind](sx, host, spec)
        if (spec.note) sx.h('div', 'sx-sub', host, spec.note)
      } catch (e) {
        host.innerHTML = '<p class="sx-err">Could not draw this chart: ' + sx.esc(e && e.message ? e.message : e) + '</p>'
      }
    }
    draw()
    if (w.ResizeObserver && !host._sxro) {
      host._sxro = new w.ResizeObserver(function () { if (Math.abs(Math.floor(host.clientWidth) - (host._sxw || 0)) > 4) draw() })
      host._sxro.observe(host)
    }
  }

  // ---- tables (sortable)
  sx.table = function (target, spec) {
    var host = $(target), cols, rows
    if (Array.isArray(spec)) { cols = []; spec.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k) }) }); rows = spec.map(function (r) { return cols.map(function (c) { return r[c] == null ? '' : r[c] }) }) }
    else { cols = spec.columns; rows = spec.rows }
    var wrap = sx.h('div', 'sx-table', host), t = sx.h('table', '', wrap), th = sx.h('thead', '', t), tr = sx.h('tr', '', th), tb = sx.h('tbody', '', t)
    cols.forEach(function (c, i) {
      var h = sx.h('th', '', tr, c)
      h.tabIndex = 0
      var go = function () {
        var dir = h.dataset.d === 'a' ? 'd' : 'a'
        ;[].forEach.call(tr.children, function (x) { delete x.dataset.d })
        h.dataset.d = dir
        var rs = [].slice.call(tb.rows)
        rs.sort(function (x, y) {
          var a = x.cells[i].dataset.v, z = y.cells[i].dataset.v, m = a !== '' && z !== '' && !isNaN(a) && !isNaN(z)
          var k = m ? a - z : a.localeCompare(z, undefined, { numeric: true })
          return dir === 'a' ? k : -k
        })
        rs.forEach(function (r) { tb.appendChild(r) })
      }
      h.onclick = go
      h.onkeydown = function (e) { if (e.key === 'Enter') go() }
    })
    rows.forEach(function (r) {
      var row = sx.h('tr', '', tb)
      cols.forEach(function (_, i) { var v = r[i] == null ? '' : r[i], td = sx.h('td', typeof v === 'number' ? 'n' : '', row, typeof v === 'number' ? sx.fmt(v) : v); td.dataset.v = v })
    })
    return wrap
  }

  // ---- talking back to the thread: never sends by itself; it fills the composer and the person presses Enter
  sx.reply = function (text) { w.parent.postMessage({ suffice_artifact: id, reply: String(text).slice(0, 4000) }, '*') }
  sx.choices = function (target, options, o) {
    o = o || {}
    var host = $(target), box = sx.h('div', 'sx-choices' + (o.multi ? ' is-multi' : ''), host), picked = []
    box.setAttribute('role', o.multi ? 'group' : 'radiogroup')
    options.forEach(function (op) {
      if (typeof op === 'string') op = { label: op }
      var b = sx.h('button', 'sx-choice', box)
      b.type = 'button'
      b.setAttribute(o.multi ? 'aria-pressed' : 'aria-checked', 'false')
      if (!o.multi) b.setAttribute('role', 'radio')
      sx.h('b', '', b, op.label)
      if (op.detail) sx.h('span', '', b, op.detail)
      b.onclick = function () {
        if (o.multi) {
          var i = picked.indexOf(op.label)
          i < 0 ? picked.push(op.label) : picked.splice(i, 1)
          b.setAttribute('aria-pressed', String(i < 0))
          return
        }
        ;[].forEach.call(box.children, function (c) { c.setAttribute('aria-checked', String(c === b)) })
        sx.reply(op.reply || (o.prefix || '') + op.label)
      }
    })
    if (o.multi) {
      var go = sx.h('button', 'sx-btn is-primary', host, o.submit || 'Use these')
      go.type = 'button'
      go.onclick = function () { if (picked.length) sx.reply((o.prefix || '') + picked.join(', ')) }
    }
    return box
  }
  /** Collects every named field in the container into "Label: value" lines. */
  sx.collect = function (root) {
    var out = []
    ;[].forEach.call($(root).querySelectorAll('input[name],select[name],textarea[name]'), function (f) {
      if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) return
      // the label's own words, without the text of the field inside it (a select's options)
      var lab = f.dataset.label
      if (!lab && f.labels && f.labels[0]) { var c = f.labels[0].cloneNode(true); [].forEach.call(c.querySelectorAll('input,select,textarea'), function (x) { x.remove() }); lab = c.textContent.trim() }
      lab = lab || f.name
      out.push(lab + ': ' + (f.type === 'checkbox' && f.value === 'on' ? 'yes' : f.value))
    })
    return out.join('\n')
  }

  // ---- ingestion: files dropped or picked are read here, never uploaded
  sx.csv = function (text) {
    var rows = [], row = [], cell = '', q = false, sep = text.indexOf('\t') > -1 && text.indexOf(',') < 0 ? '\t' : ','
    for (var i = 0; i < text.length; i++) {
      var c = text[i]
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
      else if (c === '"') q = true
      else if (c === sep) { row.push(cell); cell = '' }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
      else cell += c
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
    rows = rows.filter(function (r) { return r.some(function (c) { return c !== '' }) })
    var cols = rows.shift() || []
    return { columns: cols, rows: rows.map(function (r) { return r.map(function (v) { return v !== '' && !isNaN(v) ? +v : v }) }) }
  }
  sx.read = function (file) {
    return new Promise(function (res, rej) {
      var r = new FileReader(), image = /^image\//.test(file.type)
      r.onerror = function () { rej(r.error) }
      r.onload = function () {
        var out = { name: file.name, type: file.type, size: file.size }
        if (image) out.url = r.result
        else if (/\.(csv|tsv)$/i.test(file.name) || /csv|tab-separated/.test(file.type)) out.table = sx.csv(r.result)
        else if (/\.json$/i.test(file.name) || /json/.test(file.type)) { try { out.json = JSON.parse(r.result) } catch (e) { out.text = r.result } }
        else out.text = r.result
        res(out)
      }
      image ? r.readAsDataURL(file) : r.readAsText(file)
    })
  }
  sx.drop = function (target, cb, o) {
    o = o || {}
    var host = $(target), z = sx.h('label', 'sx-drop', host), input = sx.h('input', '', z)
    input.type = 'file'
    if (o.accept) input.accept = o.accept
    if (o.multiple) input.multiple = true
    sx.h('b', '', z, o.label || 'Drop a file here')
    sx.h('span', '', z, o.hint || 'or click to choose. It stays on this Mac.')
    var take = function (files) { [].forEach.call(files, function (f) { sx.read(f).then(cb, function (e) { cb({ name: f.name, error: String(e) }) }) }) }
    input.onchange = function () { take(input.files) }
    z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('is-over') })
    z.addEventListener('dragleave', function () { z.classList.remove('is-over') })
    z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('is-over'); take(e.dataTransfer.files) })
    return z
  }

  // ---- declarative wiring, so plain HTML needs no script
  var wire = function () {
    ;[].forEach.call(d.querySelectorAll('[data-chart]'), function (n) {
      var src = n.getAttribute('data-chart'), json = src && src.trim()[0] === '{' ? src : (n.querySelector('script[type="application/json"]') || {}).textContent
      try { sx.chart(n, JSON.parse(json)) } catch (e) { n.innerHTML = '<p class="sx-err">Could not read the chart data: ' + sx.esc(e.message) + '</p>' }
    })
    ;[].forEach.call(d.querySelectorAll('[data-reply]'), function (b) {
      if (b.matches('form,[data-form]')) return
      b.addEventListener('click', function () { sx.reply(b.getAttribute('data-reply') || b.textContent.trim()) })
    })
    ;[].forEach.call(d.querySelectorAll('form[data-reply],[data-form]'), function (f) {
      var send = function (e) { if (e) e.preventDefault(); var body = sx.collect(f); sx.reply((f.getAttribute('data-reply') || f.getAttribute('data-form') || '') + (body ? '\n' + body : '')) }
      f.addEventListener('submit', send)
      ;[].forEach.call(f.querySelectorAll('button[type="submit"],[data-submit]'), function (b) { b.addEventListener('click', send) })
    })
    ;[].forEach.call(d.querySelectorAll('.tabs'), function (t) {
      var tabs = [].slice.call(t.querySelectorAll('[data-tab]'))
      var show = function (k) {
        tabs.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === k)) })
        ;[].forEach.call(d.querySelectorAll('[data-panel]'), function (p) { if (tabs.some(function (b) { return b.dataset.tab === p.dataset.panel })) p.hidden = p.dataset.panel !== k })
      }
      tabs.forEach(function (b) { b.setAttribute('role', 'tab'); b.onclick = function () { show(b.dataset.tab) } })
      if (tabs[0]) show((tabs.find(function (b) { return b.getAttribute('aria-selected') === 'true' }) || tabs[0]).dataset.tab)
    })
    ;[].forEach.call(d.querySelectorAll('[data-table]'), function (n) {
      try { var v = JSON.parse(n.getAttribute('data-table') || (n.querySelector('script[type="application/json"]') || {}).textContent); n.innerHTML = ''; sx.table(n, v) } catch (e) { n.innerHTML = '<p class="sx-err">Could not read the table data.</p>' }
    })
    ;[].forEach.call(d.querySelectorAll('input[type="range"][data-out]'), function (r) {
      var out = d.getElementById(r.dataset.out), set = function () { if (out) out.textContent = r.value; r.style.setProperty('--p', ((r.value - r.min) / ((r.max || 100) - (r.min || 0))) * 100 + '%') }
      r.addEventListener('input', set); set()
    })
  }
  sx.ready = function (fn) { d.readyState === 'loading' ? d.addEventListener('DOMContentLoaded', fn) : fn() }
  sx.ready(function () { setTimeout(wire, 0) })
}
