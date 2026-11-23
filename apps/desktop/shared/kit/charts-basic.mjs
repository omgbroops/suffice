// Chart kinds: line, area, bar (grouped, stacked, horizontal), scatter/bubble, donut/pie.
// Each runs inside the artifact iframe via toString(): self-contained, only `sx`, `host`, `spec` and globals.
/* eslint-disable no-var */

/** {kind:'line'|'area', x:[..], series:[{name, values}], unit?, curve?: 'smooth'|'linear'|'step', stacked? (area)} */
export function line(sx, host, spec) {
  var s = sx.series(spec), area = spec.kind === 'area', stacked = area && !!spec.stacked, curve = spec.curve || 'smooth'
  var tops = s.series.map(function (se) { return se.values.slice() })
  if (stacked) for (var k = 1; k < tops.length; k++) tops[k] = tops[k].map(function (v, i) { return v + tops[k - 1][i] })
  var all = [].concat.apply([], tops)
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all)
  if (area || spec.zero !== false) lo = Math.min(0, lo)
  var labelled = s.series.length > 1 && s.series.length <= 4
  var f = sx.frame(host, { x: s.x, y: { min: lo, max: hi }, unit: spec.unit, label: spec.title, yLabel: spec.yLabel, H: spec.height, R: labelled ? 14 + 7 * Math.max.apply(null, s.series.map(function (se) { return String(se.name || '').length })) : 14 })
  var one = s.series.length === 1, dots = [], lines = []
  var g = sx.el('g', {}, f.svg)
  s.series.forEach(function (se, k) {
    var col = sx.ink(k, s.series.length, spec.color)
    var pts = tops[k].map(function (v, i) { return [f.X(i), f.Y(v)] })
    if (area) {
      var base = stacked && k > 0 ? tops[k - 1].map(function (v, i) { return [f.X(i), f.Y(v)] }).reverse() : [[pts[pts.length - 1][0], f.Y(f.zero)], [pts[0][0], f.Y(f.zero)]]
      var top = sx.path(pts, curve), back = stacked && k > 0 ? sx.path(base, curve).replace(/^M/, 'L') : 'L' + base[0][0] + ',' + base[0][1] + 'L' + base[1][0] + ',' + base[1][1]
      var a = sx.el('path', { d: top + back + 'Z', style: 'fill:' + col + ';fill-opacity:' + (one ? 0.1 : 0.2) }, g)
      sx.enter([a], 'sx-fade', 0)
    }
    var p = sx.el('path', { d: sx.path(pts, curve), pathLength: 1, style: 'fill:none;stroke:' + col + ';stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }, g)
    sx.enter([p], 'sx-draw', 0)
    p.style.animationDelay = k * 90 + 'ms'
    lines.push(p)
    dots.push(pts.map(function (q) { return sx.el('circle', { class: 'sx-dot', cx: q[0], cy: q[1], r: 4, style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2' }, g) }))
    // direct label at the line end for up to four series
    if (!one && s.series.length <= 4) {
      var end = pts[pts.length - 1], t = sx.el('text', { class: 'sx-label', x: end[0] + 6, y: end[1] + 4 }, g)
      t.textContent = se.name || ''
    }
  })
  sx.crosshair(f, s.x, s.series.map(function (se, k) { return { name: se.name, values: se.values, color: one ? null : sx.color(k) } }), spec.unit, dots)
  sx.legend(host, s.series.map(function (se) { return se.name || '' }), 'line')
}

/** {kind:'bar', x, series, stacked?, horizontal?, unit?, sort?: 'desc'|'asc'} */
export function bar(sx, host, spec) {
  var s = sx.series(spec), stacked = !!spec.stacked, one = s.series.length === 1
  var col = function (k) { return sx.ink(k, s.series.length, spec.color) }
  var order = s.x.map(function (_, i) { return i })
  if (spec.sort && one) order.sort(function (a, b) { return spec.sort === 'asc' ? s.series[0].values[a] - s.series[0].values[b] : s.series[0].values[b] - s.series[0].values[a] })
  var xs = order.map(function (i) { return s.x[i] }), vals = s.series.map(function (se) { return order.map(function (i) { return se.values[i] }) })
  var sums = xs.map(function (_, i) { return vals.reduce(function (a, v) { return a + Math.max(0, v[i]) }, 0) })
  var negs = xs.map(function (_, i) { return vals.reduce(function (a, v) { return a + Math.min(0, v[i]) }, 0) })
  var all = [].concat.apply([], vals)
  var lo = stacked ? Math.min.apply(null, negs.concat(0)) : Math.min(0, Math.min.apply(null, all)), hi = stacked ? Math.max.apply(null, sums.concat(0)) : Math.max(0, Math.max.apply(null, all))
  var tip = function (i, k) { return function () { return sx.tipRows(xs[i], (stacked ? s.series.map(function (se, j) { return [se.name || 'Value', sx.fmt(vals[j][i], spec.unit), one ? null : sx.color(j)] }) : [[s.series[k].name || 'Value', sx.fmt(vals[k][i], spec.unit), one ? null : sx.color(k)]])) } }
  var marks = []

  if (spec.horizontal) {
    var rowH = Math.max(22, Math.min(30, 260 / xs.length)), labW = Math.min(180, 12 + 6.6 * Math.max.apply(null, xs.map(function (x) { return String(x).length })))
    var W = sx.W || 640, H = rowH * xs.length + 8, X = sx.lin(lo, hi, labW, W - 60)
    var sv = sx.svg(host, W, H, spec.title).svg
    xs.forEach(function (lab, i) {
      var y = 4 + i * rowH, t = sx.el('text', { class: 'sx-label is-muted', x: labW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, sv)
      t.textContent = String(lab)
      var acc = 0
      vals.forEach(function (v, k) {
        var thick = Math.round(rowH * 0.62), bh = stacked || one ? thick : thick / vals.length
        var by = stacked || one ? y + (rowH - thick) / 2 : y + (rowH - thick) / 2 + k * bh
        var x0 = stacked ? X(acc) : X(0), x1 = stacked ? X(acc + v[i]) : X(v[i])
        if (stacked) acc += v[i]
        var last = !stacked || k === vals.length - 1
        var m = sx.el('path', { class: 'sx-mark', d: sx.barPath(Math.min(x0, x1), by, Math.max(1, Math.abs(x1 - x0) - (stacked && !last ? 2 : 0)), Math.max(1, bh - (one || stacked ? 0 : 2)), last ? 4 : 0, x1 >= x0 ? 'right' : 'left'), style: 'fill:' + col(k) }, sv)
        sx.hover(m, tip(i, k))
        marks.push(m)
      })
      var tot = stacked ? sums[i] : one ? vals[0][i] : null
      if (tot != null) { var vt = sx.el('text', { class: 'sx-label', x: X(stacked ? sums[i] : Math.max(0, vals[0][i])) + 6, y: y + rowH / 2 + 4 }, sv); vt.textContent = sx.fmt(tot, spec.unit) }
    })
    sx.enter(marks, 'sx-grow-x', 30)
  } else {
    var f = sx.frame(host, { x: xs, y: { min: lo, max: hi }, unit: spec.unit, label: spec.title, yLabel: spec.yLabel, H: spec.height })
    var gw = Math.min(f.bw * 0.72, stacked || one ? 44 : 22 * vals.length)
    var base = xs.map(function () { return [0, 0] })
    xs.forEach(function (_, i) {
      vals.forEach(function (v, k) {
        var val = v[i], bw = stacked ? gw : gw / vals.length
        var x = f.X(i) - gw / 2 + (stacked ? 0 : k * bw)
        var b0 = stacked ? (val >= 0 ? base[i][0] : base[i][1]) : 0, b1 = b0 + val
        if (stacked) val >= 0 ? (base[i][0] = b1) : (base[i][1] = b1)
        var y = Math.min(f.Y(b0), f.Y(b1)), h = Math.abs(f.Y(b1) - f.Y(b0))
        var top = !stacked || k === vals.length - 1 || (val >= 0 ? vals.slice(k + 1).every(function (w2) { return w2[i] <= 0 }) : vals.slice(k + 1).every(function (w2) { return w2[i] >= 0 }))
        var gap = stacked && !top ? 2 : 0
        var m = sx.el('path', { class: 'sx-mark' + (val < 0 ? ' is-neg' : ''), d: sx.barPath(x + (stacked || one ? 0 : 1), val >= 0 ? y + gap : y, Math.max(1, bw - (stacked || one ? 0 : 2)), Math.max(0.5, h - gap), top ? 4 : 0, val >= 0 ? 'up' : 'down'), style: 'fill:' + col(k) }, f.svg)
        sx.hover(m, tip(i, k))
        marks.push(m)
      })
    })
    if (one && xs.length <= 12) xs.forEach(function (_, i) { var v = vals[0][i], t = sx.el('text', { class: 'sx-label is-muted', x: f.X(i), y: (v >= 0 ? f.Y(v) - 6 : f.Y(v) + 14), 'text-anchor': 'middle' }, f.svg); t.textContent = sx.fmt(v, spec.unit) })
    sx.enter(marks, 'sx-grow-y', Math.max(8, 360 / marks.length))
  }
  sx.legend(host, s.series.map(function (se) { return se.name || '' }))
}

/** {kind:'scatter'|'bubble', points:[{x, y, size?, label?, group?}], xLabel?, yLabel?, unit?, xUnit?} */
export function scatter(sx, host, spec) {
  var pts = spec.points
  sx.need(Array.isArray(pts) && pts.length && pts.every(function (p) { return sx.num(p.x) && sx.num(p.y) }), 'Scatter needs points: [{x, y}].')
  var groups = []
  pts.forEach(function (p) { if (p.group != null && groups.indexOf(p.group) < 0) groups.push(p.group) })
  sx.need(groups.length <= 8, 'Scatter has more than 8 groups; fold the rest into "Other".')
  var xsv = pts.map(function (p) { return p.x }), ysv = pts.map(function (p) { return p.y })
  var pad = function (a, b) { var d = (b - a) * 0.06 || 1; return [a - d, b + d] }
  var xr = pad(Math.min.apply(null, xsv), Math.max.apply(null, xsv)), yr = pad(Math.min.apply(null, ysv), Math.max.apply(null, ysv))
  var f = sx.frame(host, { x: { min: xr[0], max: xr[1] }, y: { min: yr[0], max: yr[1] }, unit: spec.unit, xUnit: spec.xUnit, label: spec.title, yLabel: spec.yLabel, H: spec.height || 300, B: spec.xLabel ? 42 : 30 })
  if (spec.xLabel) { var xl = sx.el('text', { class: 'sx-axis-label', x: f.W - f.R, y: f.H - 4, 'text-anchor': 'end' }, f.svg); xl.textContent = spec.xLabel }
  var sizes = pts.map(function (p) { return sx.num(p.size) ? p.size : 0 }), smax = Math.max.apply(null, sizes) || 1
  var bubble = spec.kind === 'bubble' || sizes.some(Boolean)
  var g = sx.el('g', {}, f.svg), marks = []
  pts.slice().sort(function (a, b) { return (b.size || 0) - (a.size || 0) }).forEach(function (p) {
    var k = p.group == null ? -1 : groups.indexOf(p.group)
    var col = k < 0 ? 'var(--c1)' : sx.color(k)
    var r = bubble ? 4 + 22 * Math.sqrt((p.size || 0) / smax) : 4.5
    var c = sx.el('circle', { class: 'sx-mark', cx: f.X(p.x), cy: f.Y(p.y), r: r, style: 'fill:' + col + ';fill-opacity:' + (bubble ? 0.55 : 0.85) + ';stroke:var(--surface);stroke-width:1.5' }, g)
    sx.hover(c, sx.tipRows(p.label != null ? p.label : null, [[spec.xLabel || 'x', sx.fmt(p.x, spec.xUnit)], [spec.yLabel || 'y', sx.fmt(p.y, spec.unit)]].concat(bubble && p.size != null ? [[spec.sizeLabel || 'size', sx.fmt(p.size)]] : []).concat(p.group != null ? [['group', p.group, col]] : [])))
    marks.push(c)
    if (p.label != null && pts.length <= 14) { var t = sx.el('text', { class: 'sx-label is-muted', x: f.X(p.x) + r + 4, y: f.Y(p.y) + 4 }, g); t.textContent = p.label }
  })
  sx.enter(marks, 'sx-pop', Math.max(6, 400 / marks.length))
  sx.legend(host, groups.map(String))
}

/** {kind:'donut'|'pie', data:[{label, value}], unit?, total?: label for the centre} */
export function donut(sx, host, spec) {
  var data = spec.data || (spec.x && spec.series ? spec.x.map(function (x, i) { return { label: x, value: spec.series[0].values[i] } }) : null)
  sx.need(Array.isArray(data) && data.length && data.every(function (d) { return sx.num(d.value) && d.value >= 0 }), 'Donut needs data: [{label, value}] with values >= 0.')
  data = sx.fold(data)
  var sum = data.reduce(function (a, d) { return a + d.value }, 0) || 1
  var W = sx.W || 640, narrow = W < 460, R = narrow ? 78 : 96, H = 2 * R + 16, cx = R + 8, cy = H / 2, r0 = spec.kind === 'pie' ? 0 : Math.round(R * 0.64), lx = cx + R + 28
  var sv = sx.svg(host, W, H, spec.title).svg
  var g = sx.el('g', { class: 'sx-pop' }, sv), a = -Math.PI / 2, marks = []
  if (sx.reduce) g.removeAttribute('class')
  data.forEach(function (d, k) {
    var span = (d.value / sum) * Math.PI * 2, a1 = a + span
    var large = span > Math.PI ? 1 : 0, P = function (rad, ang) { return (cx + rad * Math.cos(ang)).toFixed(2) + ',' + (cy + rad * Math.sin(ang)).toFixed(2) }
    var full = span >= Math.PI * 2 - 1e-6
    var path = full ? 'M' + P(R, a) + 'A' + R + ',' + R + ' 0 1 1 ' + P(R, a + Math.PI) + 'A' + R + ',' + R + ' 0 1 1 ' + P(R, a) + (r0 ? 'M' + P(r0, a) + 'A' + r0 + ',' + r0 + ' 0 1 0 ' + P(r0, a + Math.PI) + 'A' + r0 + ',' + r0 + ' 0 1 0 ' + P(r0, a) : '') + 'Z'
      : 'M' + P(R, a) + 'A' + R + ',' + R + ' 0 ' + large + ' 1 ' + P(R, a1) + (r0 ? 'L' + P(r0, a1) + 'A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + P(r0, a) : 'L' + cx + ',' + cy) + 'Z'
    var col = d.other ? 'var(--faint)' : sx.color(k)
    var m = sx.el('path', { class: 'sx-mark', d: path, 'fill-rule': 'evenodd', style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2;stroke-linejoin:round' }, g)
    sx.hover(m, sx.tipRows(d.label, [[sx.fmt(d.value, spec.unit), Math.round((d.value / sum) * 1000) / 10 + '%', col]]))
    marks.push(m)
    a = a1
  })
  if (r0) {
    var tv = sx.el('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', style: 'fill:var(--fg);font-size:' + (narrow ? 18 : 22) + 'px;font-weight:500;letter-spacing:-.02em' }, sv)
    tv.textContent = sx.fmt(sum, spec.unit)
    var tl = sx.el('text', { x: cx, y: cy + 20, 'text-anchor': 'middle', class: 'sx-tick' }, sv)
    tl.textContent = spec.total || 'Total'
  }
  // the key doubles as the direct labels: name, value, share
  var rowH = Math.min(24, (H - 12) / data.length)
  data.forEach(function (d, k) {
    var y = cy - (rowH * data.length) / 2 + rowH * k + rowH / 2
    sx.el('rect', { x: lx, y: y - 5, width: 10, height: 10, rx: 3, style: 'fill:' + (d.other ? 'var(--faint)' : sx.color(k)) }, sv)
    var t = sx.el('text', { class: 'sx-label', x: lx + 18, y: y + 4 }, sv)
    t.textContent = d.label
    var v = sx.el('text', { class: 'sx-label is-muted', x: W - 8, y: y + 4, 'text-anchor': 'end' }, sv)
    v.textContent = sx.fmt(d.value, spec.unit) + ' · ' + Math.round((d.value / sum) * 100) + '%'
  })
}
