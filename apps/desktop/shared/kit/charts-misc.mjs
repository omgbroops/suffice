// Chart kinds: radar, gauge, sparkline, candlestick, timeline. Same rules as charts-basic.mjs: each function runs in the iframe via toString(),
// self-contained, only `sx`, `host`, `spec` and globals.
/* eslint-disable no-var */

/** {kind:'radar', axes:[names], series:[{name, values:[..one per axis]}], max?, unit?} */
export function radar(sx, host, spec) {
  var axes = spec.axes, series = spec.series
  sx.need(Array.isArray(axes) && axes.length >= 3, 'A radar chart needs "axes": at least three axis names.')
  sx.need(Array.isArray(series) && series.length >= 1, 'A radar chart needs "series": [{name, values}].')
  sx.need(series.length <= 8, 'A radar chart shows at most 8 series.')
  series.forEach(function (s) { sx.need(Array.isArray(s.values) && s.values.length === axes.length, 'Each radar series needs one value per axis.') })
  var n = axes.length, W = sx.W, pad = W < 420 ? 64 : 90
  var all = [].concat.apply([], series.map(function (s) { return s.values }))
  var ticks = sx.ticks(0, spec.max != null ? spec.max : Math.max.apply(null, all), 4), top = ticks[ticks.length - 1]
  var R = Math.max(50, Math.min(W / 2 - pad, 150)), cx = W / 2, cy = R + 24, H = cy + R + 24
  var s = sx.svg(host, W, H, spec.title || 'Radar chart'), svg = s.svg
  var ang = function (i) { return -Math.PI / 2 + (i * 2 * Math.PI) / n }
  var pt = function (i, v) { var r = (R * v) / top; return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] }
  var grid = sx.el('g', { class: 'sx-grid' }, svg)
  ticks.slice(1).forEach(function (t, k) {
    var pts = axes.map(function (_, i) { return pt(i, t).join(',') }).join(' ')
    sx.el('polygon', { points: pts, style: 'fill:none;stroke:var(--line)' }, grid)
    var lab = sx.el('text', { class: 'sx-tick', x: cx + 4, y: cy - (R * t) / top + 12, style: 'paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round' }, grid)
    // scale numbers sit above the series shapes once those are drawn (end of this call)
    Promise.resolve(lab).then(function (n) { if (n.parentNode) n.ownerSVGElement.appendChild(n) })
    lab.textContent = sx.fmt(t, spec.unit)
  })
  axes.forEach(function (name, i) {
    var e = pt(i, top), c = Math.cos(ang(i))
    sx.el('line', { x1: cx, y1: cy, x2: e[0], y2: e[1], style: 'stroke:var(--line2)' }, grid)
    var t = sx.el('text', { class: 'sx-label', x: cx + (R + 10) * c, y: cy + (R + 10) * Math.sin(ang(i)) + 4, 'text-anchor': Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end' }, svg)
    t.textContent = String(name)
  })
  var polys = [], dots = []
  series.forEach(function (se, k) {
    var col = sx.ink(k, series.length, spec.color)
    var g = sx.el('g', { class: 'sx-mark' }, svg)
    var poly = sx.el('polygon', { points: se.values.map(function (v, i) { return pt(i, v).join(',') }).join(' '), style: 'fill:' + col + ';fill-opacity:.14;stroke:' + col + ';stroke-width:2;stroke-linejoin:round' }, g)
    sx.hover(poly, sx.tipRows(se.name || 'Series ' + (k + 1), axes.map(function (a, i) { return [a, sx.fmt(se.values[i], spec.unit), col] })))
    polys.push(g)
    se.values.forEach(function (v, i) {
      var p = pt(i, v), d = sx.el('circle', { cx: p[0], cy: p[1], r: 4, style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2' }, g)
      sx.hover(d, sx.tipRows(axes[i], [[se.name || 'Series ' + (k + 1), sx.fmt(v, spec.unit), col]]))
      dots.push(d)
    })
  })
  sx.enter(polys, 'sx-fade', 90)
  sx.legend(host, series.map(function (se) { return se.name || '' }))
}

/** {kind:'gauge', value, min?:0, max?:100, unit?, label?, bands?:[{to, status:'good'|'warn'|'bad'}]} */
export function gauge(sx, host, spec) {
  sx.need(typeof spec.value === 'number', 'A gauge needs a numeric "value".')
  var min = spec.min != null ? spec.min : 0, max = spec.max != null ? spec.max : 100
  sx.need(max > min, 'A gauge needs "max" greater than "min".')
  var bands = spec.bands || [], v = Math.max(min, Math.min(max, spec.value))
  var size = Math.min(sx.W, 280), R = size / 2 - 16, cx = sx.W / 2, cy = size / 2, H = cy + R * 0.5 + 22, sw = 14
  var s = sx.svg(host, sx.W, H, spec.title || 'Gauge'), svg = s.svg
  var A0 = (150 * Math.PI) / 180, SPAN = (240 * Math.PI) / 180
  var at = function (t, r) { var a = A0 + SPAN * t; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] }
  var arc = function (t0, t1, r) {
    var p = at(t0, r), q = at(t1, r)
    return 'M' + p[0] + ',' + p[1] + 'A' + r + ',' + r + ' 0 ' + ((t1 - t0) * 240 > 180 ? 1 : 0) + ' 1 ' + q[0] + ',' + q[1]
  }
  var frac = function (x) { return (Math.max(min, Math.min(max, x)) - min) / (max - min) }
  var track = sx.el('path', { d: arc(0, 1, R), style: 'fill:none;stroke:var(--fill3);stroke-width:' + sw + ';stroke-linecap:round' }, svg)
  var stat = function (st) { return 'var(--' + st + ')' }, cur = null, from = 0
  bands.slice().sort(function (a, b) { return a.to - b.to }).forEach(function (b) {
    var t1 = frac(b.to)
    if (t1 > from) {
      var seg = sx.el('path', { d: arc(from, t1, R + sw / 2 + 5), style: 'fill:none;stroke:' + stat(b.status) + ';stroke-width:3' }, svg)
      sx.hover(seg, sx.tipRows(b.status, [['Up to', sx.fmt(b.to, spec.unit), stat(b.status)]]))
    }
    if (!cur && v <= b.to) cur = b.status
    from = t1
  })
  var col = cur ? stat(cur) : sx.color(0), t = frac(v)
  if (t > 0) {
    var val = sx.el('path', { d: arc(0, t, R), pathLength: 1, class: 'sx-mark', style: 'fill:none;stroke:' + col + ';stroke-width:' + sw + ';stroke-linecap:round' }, svg)
    sx.enter([val], 'sx-draw', 0)
    sx.hover(val, sx.tipRows(spec.label || 'Value', [['Value', sx.fmt(spec.value, spec.unit), col], ['Range', sx.fmt(min) + ' to ' + sx.fmt(max)]]))
  }
  var big = sx.el('text', { class: 'sx-label', x: cx, y: cy + 8, 'text-anchor': 'middle', style: 'font-size:32px;font-weight:500;font-variant-numeric:tabular-nums' }, svg)
  big.textContent = sx.fmt(spec.value, spec.unit)
  if (spec.label) { var lb = sx.el('text', { class: 'sx-label is-muted', x: cx, y: cy + 30, 'text-anchor': 'middle' }, svg); lb.textContent = spec.label }
  ;[[0, min], [1, max]].forEach(function (e) {
    var p = at(e[0], R), tx = sx.el('text', { class: 'sx-tick', x: p[0], y: p[1] + 20, 'text-anchor': 'middle' }, svg)
    tx.textContent = sx.fmt(e[1])
  })
}

/** {kind:'sparkline', values:[..], x?:[labels], unit?}  works in an inline-block span with a width */
export function sparkline(sx, host, spec) {
  var vals = spec.values
  sx.need(Array.isArray(vals) && vals.length >= 2, 'A sparkline needs "values": at least two numbers.')
  var W = Math.floor(host.clientWidth) || sx.W, H = 36, p = 5
  var s = sx.svg(host, W, H, spec.title || 'Sparkline'), svg = s.svg
  s.svg.style.height = H + 'px'
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), n = vals.length
  var X = function (i) { return p + ((W - 2 * p) * i) / (n - 1) }
  var Y = function (v) { return hi === lo ? H / 2 : H - p - ((H - 2 * p) * (v - lo)) / (hi - lo) }
  var col = sx.ink(0, 1, spec.color)
  var path = sx.el('path', { d: vals.map(function (v, i) { return (i ? 'L' : 'M') + X(i) + ',' + Y(v) }).join(''), pathLength: 1, style: 'fill:none;stroke:' + col + ';stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }, svg)
  sx.enter([path], 'sx-draw', 0)
  var dot = function (i, filled, r) { return sx.el('circle', { cx: X(i), cy: Y(vals[i]), r: r, style: 'fill:' + (filled ? col : 'var(--surface)') + ';stroke:' + col + ';stroke-width:1.5' }, svg) }
  var iMin = vals.indexOf(lo), iMax = vals.indexOf(hi), pops = []
  if (hi !== lo) { pops.push(dot(iMin, false, 3)); pops.push(dot(iMax, false, 3)) }
  pops.push(dot(n - 1, true, 3.5))
  sx.enter(pops, 'sx-pop', 0)
  var cur = sx.el('circle', { r: 4, cx: 0, cy: 0, visibility: 'hidden', style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2' }, svg)
  var hit = sx.el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, svg)
  hit.addEventListener('pointermove', function (e) {
    var r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round(((((e.clientX - r.left) / r.width) * W - p) / (W - 2 * p)) * (n - 1))))
    cur.setAttribute('cx', X(i)); cur.setAttribute('cy', Y(vals[i])); cur.setAttribute('visibility', 'visible')
    sx.tip(sx.tipRows(spec.x && spec.x[i] != null ? spec.x[i] : '#' + (i + 1), [['Value', sx.fmt(vals[i], spec.unit), col]]), e.clientX, e.clientY)
  })
  hit.addEventListener('pointerleave', function () { cur.setAttribute('visibility', 'hidden'); sx.tip(null) })
}

/** {kind:'candlestick', rows:[{date, open, high, low, close}], unit?}  up = slot 3, down = slot 8 */
export function candlestick(sx, host, spec) {
  var rows = spec.rows
  sx.need(Array.isArray(rows) && rows.length >= 1, 'A candlestick chart needs "rows": [{date, open, high, low, close}].')
  rows.forEach(function (r) { sx.need(['open', 'high', 'low', 'close'].every(function (k) { return typeof r[k] === 'number' }), 'Each candlestick row needs numeric open, high, low and close.') })
  var lo = Math.min.apply(null, rows.map(function (r) { return r.low })), hi = Math.max.apply(null, rows.map(function (r) { return r.high }))
  var padv = (hi - lo) * 0.06 || 1
  var f = sx.frame(host, { x: rows.map(function (r) { return String(r.date) }), y: { min: lo - padv, max: hi + padv }, unit: spec.unit, label: spec.title || 'Candlestick chart', H: spec.height })
  var up = sx.color(2), down = sx.color(7), bw = Math.max(2, Math.min(f.bw * 0.62, 18)), gs = []
  rows.forEach(function (r, i) {
    var col = r.close >= r.open ? up : down, x = f.X(i)
    var g = sx.el('g', { class: 'sx-mark' }, f.svg)
    sx.el('line', { x1: x, x2: x, y1: f.Y(r.high), y2: f.Y(r.low), style: 'stroke:' + col + ';stroke-width:1.5;stroke-linecap:round' }, g)
    var y0 = f.Y(Math.max(r.open, r.close)), h = Math.max(1.5, Math.abs(f.Y(r.open) - f.Y(r.close)))
    sx.el('rect', { x: x - bw / 2, y: y0, width: bw, height: h, rx: Math.min(2, bw / 2), style: 'fill:' + col + ';stroke:var(--surface);stroke-width:1' }, g)
    var hit = sx.el('rect', { x: x - f.bw / 2, y: f.T, width: f.bw, height: f.H - f.T - f.B, fill: 'transparent' }, g)
    sx.hover(hit, sx.tipRows(r.date, [['Open', sx.fmt(r.open, spec.unit)], ['High', sx.fmt(r.high, spec.unit)], ['Low', sx.fmt(r.low, spec.unit)], ['Close', sx.fmt(r.close, spec.unit), col]]))
    gs.push(g)
  })
  sx.enter(gs, 'sx-fade', 12)
  var l = sx.h('div', 'sx-legend', host)
  ;[['Up', up], ['Down', down]].forEach(function (e) { var sp = sx.h('span', '', l); sx.h('i', '', sp).style.background = e[1]; sx.h('span', '', sp, e[0]) })
}

/** {kind:'timeline', items:[{label, start:'YYYY-MM-DD', end?:'YYYY-MM-DD', group?}]}  no end = milestone diamond */
export function timeline(sx, host, spec) {
  var items = spec.items
  sx.need(Array.isArray(items) && items.length >= 1, 'A timeline needs "items": [{label, start, end?, group?}].')
  var day = 864e5, D = function (s) { return Date.parse(s) }
  items.forEach(function (it) { sx.need(it.label != null && !isNaN(D(it.start)) && (it.end == null || !isNaN(D(it.end))), 'Each timeline item needs a label and dates as YYYY-MM-DD.') })
  var groups = []
  items.forEach(function (it) { if (it.group != null && groups.indexOf(it.group) < 0) groups.push(it.group) })
  sx.need(groups.length <= 8, 'A timeline colours at most 8 groups.')
  var t0 = Math.min.apply(null, items.map(function (it) { return D(it.start) })), t1 = Math.max.apply(null, items.map(function (it) { return D(it.end != null ? it.end : it.start) }))
  if (t1 === t0) t1 = t0 + 7 * day
  var W = sx.W, rowH = 28, T = 8, B = 28, H = T + items.length * rowH + B
  var cw = W < 420 ? 6 : 6.4, LW = Math.min(Math.round(W * (W < 420 ? 0.34 : 0.28)), 12 + Math.max.apply(null, items.map(function (it) { return String(it.label).length })) * cw), R = 14
  var X = sx.lin(t0, t1, LW + 10, W - R)
  var s = sx.svg(host, W, H, spec.title || 'Timeline'), svg = s.svg
  var grid = sx.el('g', { class: 'sx-grid' }, svg)
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], span = (t1 - t0) / day, maxT = Math.max(2, Math.floor((W - LW - R) / 64)), ticks = [], tl = []
  if (span <= 84) {
    var wk = Math.ceil(span / 7 / maxT) * 7, d = new Date(t0)
    for (var q = t0; q <= t1; q += wk * day) { ticks.push(q); d = new Date(q); tl.push(MO[d.getUTCMonth()] + ' ' + d.getUTCDate()) }
  } else {
    var step = [1, 2, 3, 6, 12].find(function (m) { return span / 30.4 / m <= maxT }) || 12, a = new Date(t0)
    var y = a.getUTCFullYear(), m = a.getUTCMonth() + (a.getUTCDate() > 1 ? 1 : 0)
    for (; ; m += step) {
      var tt = Date.UTC(y, m, 1)
      if (tt > t1) break
      if (tt >= t0) { ticks.push(tt); var dd = new Date(tt); tl.push(MO[dd.getUTCMonth()] + (dd.getUTCMonth() === 0 || !tl.length ? ' ' + dd.getUTCFullYear() : '')) }
    }
  }
  ticks.forEach(function (t, i) {
    sx.el('line', { class: 'sx-vgrid', x1: X(t), x2: X(t), y1: T, y2: H - B }, grid)
    var tx = sx.el('text', { class: 'sx-tick', x: X(t), y: H - B + 18, 'text-anchor': i === 0 && X(t) < LW + 20 ? 'start' : 'middle' }, grid)
    tx.textContent = tl[i]
  })
  var marks = []
  items.forEach(function (it, i) {
    var cy = T + i * rowH + rowH / 2, col = it.group != null ? sx.color(groups.indexOf(it.group)) : sx.color(0)
    var maxc = Math.floor((LW - 8) / cw), lab = String(it.label), t = sx.el('text', { class: 'sx-label', x: 0, y: cy + 4 }, svg)
    t.textContent = lab.length > maxc ? lab.slice(0, Math.max(1, maxc - 1)) + '…' : lab
    var node, a = it.start, rows = [['Start', a, col]]
    if (it.end != null) {
      var x0 = X(D(a)), x1 = Math.max(x0 + 6, X(D(it.end)))
      node = sx.el('rect', { x: x0, y: cy - 8, width: x1 - x0, height: 16, rx: 5, style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2' }, svg)
      rows.push(['End', it.end], ['Days', String(Math.round((D(it.end) - D(a)) / day))])
    } else {
      var x = X(D(a))
      node = sx.el('path', { d: 'M' + x + ',' + (cy - 8) + 'L' + (x + 8) + ',' + cy + 'L' + x + ',' + (cy + 8) + 'L' + (x - 8) + ',' + cy + 'Z', style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2;stroke-linejoin:round' }, svg)
      rows = [['Date', a, col]]
    }
    node.classList.add('sx-mark')
    sx.hover(node, sx.tipRows(it.label, rows.concat(it.group != null ? [['Group', String(it.group)]] : [])))
    marks.push(node)
  })
  sx.enter(marks, 'sx-grow-x', 30)
  sx.legend(host, groups.map(String))
}

/** kind name -> function */
export const KINDS = { radar, spider: radar, gauge, dial: gauge, sparkline, candlestick, ohlc: candlestick, timeline, gantt: timeline }
