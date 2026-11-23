// Chart kinds: histogram, boxplot, heatmap, calendar. Same rules as charts-basic.mjs: each function runs in the iframe via toString(),
// self-contained, only `sx`, `host`, `spec` and globals.
/* eslint-disable no-var */

/** {kind:'histogram', values:[numbers], bins?: count, unit?, yLabel?, name?} */
export function histogram(sx, host, spec) {
  sx.need(Array.isArray(spec.values) && spec.values.length && spec.values.every(sx.num), 'Histogram needs a values array of numbers.')
  var v = spec.values, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), edges = []
  if (hi === lo) { lo -= 0.5; hi += 0.5 }
  if (spec.bins > 0) {
    var nb = Math.min(60, Math.round(spec.bins))
    for (var i = 0; i <= nb; i++) edges.push(lo + ((hi - lo) * i) / nb)
  } else {
    var tk = sx.ticks(lo, hi, Math.max(5, Math.min(14, Math.round(Math.sqrt(v.length)))))
    edges = tk.slice()
    while (edges.length > 2 && edges[edges.length - 2] >= hi) edges.pop()
  }
  var n = edges.length - 1, counts = []
  for (var b = 0; b < n; b++) counts.push(0)
  v.forEach(function (x) {
    var k = 0
    while (k < n - 1 && x >= edges[k + 1]) k++
    counts[k]++
  })
  var f = sx.frame(host, { x: { min: edges[0], max: edges[n] }, y: { min: 0, max: Math.max.apply(null, counts) }, xUnit: spec.unit, label: spec.title, yLabel: spec.yLabel || 'Count', H: spec.height })
  var marks = []
  counts.forEach(function (c, i) {
    if (!c) return
    var x0 = f.X(edges[i]) + 0.5, x1 = f.X(edges[i + 1]) - 0.5
    var m = sx.el('path', { class: 'sx-mark', d: sx.barPath(x0, f.Y(c), Math.max(1, x1 - x0), f.Y(0) - f.Y(c), 3, 'up'), style: 'fill:' + (spec.color || 'var(--c1)') }, f.svg)
    sx.hover(m, sx.tipRows(sx.fmt(edges[i], spec.unit) + ' to ' + sx.fmt(edges[i + 1], spec.unit), [[spec.name || 'Count', String(c)]]))
    marks.push(m)
  })
  sx.enter(marks, 'sx-grow-y', 24)
}

/** {kind:'boxplot', groups:[{name, values:[numbers]}], unit?}  whiskers reach the furthest value within 1.5 x IQR; beyond that are dots */
export function boxplot(sx, host, spec) {
  sx.need(Array.isArray(spec.groups) && spec.groups.length, 'Boxplot needs a groups array of {name, values}.')
  spec.groups.forEach(function (g) { sx.need(g && Array.isArray(g.values) && g.values.length && g.values.every(sx.num), 'Each boxplot group needs a name and a values array of numbers.') })
  var q = function (s, p) { var i = (s.length - 1) * p, a = Math.floor(i); return s[a] + (s[Math.min(a + 1, s.length - 1)] - s[a]) * (i - a) }
  var st = spec.groups.map(function (g) {
    var s = g.values.slice().sort(function (a, b) { return a - b }), q1 = q(s, 0.25), q3 = q(s, 0.75), r = 1.5 * (q3 - q1)
    var inn = s.filter(function (x) { return x >= q1 - r && x <= q3 + r })
    return { name: g.name, q1: q1, med: q(s, 0.5), q3: q3, lo: inn[0], hi: inn[inn.length - 1], out: s.filter(function (x) { return x < q1 - r || x > q3 + r }), n: s.length }
  })
  var all = [].concat.apply([], spec.groups.map(function (g) { return g.values }))
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all)
  var f = sx.frame(host, { x: st.map(function (s) { return String(s.name) }), y: { min: spec.zero ? Math.min(0, lo) : lo, max: hi }, unit: spec.unit, label: spec.title, yLabel: spec.yLabel, H: spec.height })
  var bw = Math.min(f.bw * 0.56, 56), multi = st.length > 1 && st.length <= 8, marks = []
  st.forEach(function (s, i) {
    var cx = f.X(i), col = multi ? sx.color(i) : 'var(--c1)', g = sx.el('g', { class: 'sx-mark' }, f.svg)
    var ln = function (x1, y1, x2, y2, st2) { return sx.el('line', { x1: x1, y1: y1, x2: x2, y2: y2, style: st2 || 'stroke:var(--muted);stroke-width:1.5' }, g) }
    ln(cx, f.Y(s.hi), cx, f.Y(s.q3)); ln(cx, f.Y(s.q1), cx, f.Y(s.lo))
    ln(cx - bw / 4, f.Y(s.hi), cx + bw / 4, f.Y(s.hi)); ln(cx - bw / 4, f.Y(s.lo), cx + bw / 4, f.Y(s.lo))
    sx.el('rect', { x: cx - bw / 2, y: f.Y(s.q3), width: bw, height: Math.max(2, f.Y(s.q1) - f.Y(s.q3)), rx: 3, style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2' }, g)
    ln(cx - bw / 2 + 1, f.Y(s.med), cx + bw / 2 - 1, f.Y(s.med), 'stroke:var(--surface);stroke-width:2.5')
    s.out.forEach(function (o) { sx.el('circle', { cx: cx, cy: f.Y(o), r: 3.5, style: 'fill:' + col + ';stroke:var(--surface);stroke-width:2' }, g) })
    var u = spec.unit, rows = [['Max', sx.fmt(s.hi, u)], ['Q3', sx.fmt(s.q3, u)], ['Median', sx.fmt(s.med, u)], ['Q1', sx.fmt(s.q1, u)], ['Min', sx.fmt(s.lo, u)]]
    if (s.out.length) rows.push(['Outliers', String(s.out.length)])
    sx.hover(g, sx.tipRows(String(s.name) + ' (n=' + s.n + ')', rows))
    marks.push(g)
  })
  sx.enter(marks, 'sx-fade', 60)
}

/** {kind:'heatmap', rows:[labels], cols:[labels], values:[[number|null per col] per row], unit?, diverging?: bool (auto when any value is negative)} */
export function heatmap(sx, host, spec) {
  var rows = spec.rows, cols = spec.cols || spec.columns, M = spec.values || spec.matrix
  sx.need(Array.isArray(rows) && rows.length && Array.isArray(cols) && cols.length, 'Heatmap needs rows and cols label arrays.')
  sx.need(Array.isArray(M) && M.length === rows.length && M.every(function (r) { return Array.isArray(r) && r.length === cols.length && r.every(function (x) { return x == null || sx.num(x) }) }), 'Heatmap values must be a matrix with one row per row label and one number per column label.')
  var flat = [].concat.apply([], M).filter(sx.num)
  sx.need(flat.length, 'Heatmap has no numeric values.')
  var lo = Math.min.apply(null, flat), hi = Math.max.apply(null, flat), div = spec.diverging != null ? !!spec.diverging : lo < 0
  var amax = Math.max(Math.abs(lo), Math.abs(hi)) || 1
  var tOf = function (x) { return div ? x / amax : hi === lo ? 1 : (x - lo) / (hi - lo) }
  var colorOf = function (x) { var t = tOf(x); return div ? sx.div(t) : sx.seq(t) }
  var W = sx.W || 640, L = Math.min(150, 10 + 6.6 * Math.max.apply(null, rows.map(function (r) { return String(r).length }))), R = 4
  var cw = (W - L - R) / cols.length, ch = Math.max(22, Math.min(36, cw * 0.62)), T = 22, H = T + ch * rows.length + 34
  var s = sx.svg(host, W, H, spec.title), svg = s.svg, marks = []
  var every = Math.ceil(Math.max.apply(null, cols.map(function (c) { return String(c).length })) * 6.4 / cw)
  cols.forEach(function (c, j) {
    if (j % every) return
    var t = sx.el('text', { class: 'sx-tick', x: L + cw * (j + 0.5), y: T - 8, 'text-anchor': 'middle' }, svg)
    t.textContent = String(c)
  })
  var showVal = cw >= 36 && ch >= 20
  rows.forEach(function (r, i) {
    var lt = sx.el('text', { class: 'sx-label is-muted', x: L - 8, y: T + ch * (i + 0.5) + 4, 'text-anchor': 'end' }, svg)
    lt.textContent = String(r)
    cols.forEach(function (c, j) {
      var x = M[i][j], rect = sx.el('rect', { class: 'sx-mark', x: L + cw * j, y: T + ch * i, width: cw, height: ch, rx: 3, style: 'fill:' + (x == null ? 'var(--fill)' : colorOf(x)) + ';stroke:var(--surface);stroke-width:2' }, svg)
      marks.push(rect)
      if (x == null) return
      sx.hover(rect, sx.tipRows(String(r) + ' / ' + String(c), [[spec.name || 'Value', sx.fmt(x, spec.unit), colorOf(x)]]))
      if (showVal) {
        var t = sx.el('text', { class: 'sx-tick', x: L + cw * (j + 0.5), y: T + ch * (i + 0.5) + 4, 'text-anchor': 'middle', 'pointer-events': 'none', style: 'fill:' + (Math.abs(tOf(x)) > 0.5 ? 'var(--surface)' : 'var(--fg)') }, svg)
        t.textContent = sx.fmt(x, spec.unit)
      }
    })
  })
  // key: five discrete steps, low to high
  var ky = T + ch * rows.length + 14, kx = L, lab = sx.el('text', { class: 'sx-tick', x: kx, y: ky + 9 }, svg)
  lab.textContent = sx.fmt(lo, spec.unit)
  var x0 = kx + lab.getComputedTextLength() + 8
  for (var k = 0; k < 5; k++) sx.el('rect', { x: x0 + k * 18, y: ky, width: 16, height: 10, rx: 2, style: 'fill:' + (div ? sx.div(-1 + k / 2) : sx.seq(k / 4)) }, svg)
  var hl = sx.el('text', { class: 'sx-tick', x: x0 + 5 * 18 + 4, y: ky + 9 }, svg)
  hl.textContent = sx.fmt(hi, spec.unit)
  sx.enter(marks, 'sx-fade', 4)
}

/** {kind:'calendar', days:[{date:'2026-01-03', value}], unit?}  weeks as columns, Sunday to Saturday as rows; missing days read as zero */
export function calendar(sx, host, spec) {
  sx.need(Array.isArray(spec.days) && spec.days.length, 'Calendar needs a days array of {date, value}.')
  var DAY = 864e5, byDate = {}, ts = []
  spec.days.forEach(function (d) {
    var t = Date.parse(String(d && d.date).slice(0, 10) + 'T00:00:00Z')
    sx.need(isFinite(t) && sx.num(d.value), 'Each calendar day needs a date like 2026-01-03 and a numeric value.')
    byDate[t] = (byDate[t] || 0) + d.value; ts.push(t)
  })
  var first = Math.min.apply(null, ts), last = Math.max.apply(null, ts)
  var W = sx.W || 640, L = 32, R = 4, T = 18, pitch = Math.max(9, Math.min(16, Math.floor((W - L - R) / (Math.ceil((last - first) / DAY / 7) + 2))))
  var start = first - new Date(first).getUTCDay() * DAY, maxWeeks = Math.floor((W - L - R) / pitch)
  var weeks = Math.floor((last - start) / DAY / 7) + 1
  if (weeks > maxWeeks) { start += (weeks - maxWeeks) * 7 * DAY; weeks = maxWeeks }
  var vals = Object.keys(byDate).filter(function (t) { return +t >= start }).map(function (t) { return byDate[t] }), vmax = Math.max.apply(null, vals.concat(0)) || 1
  var level = function (x) { return x > 0 ? Math.min(4, Math.ceil((x / vmax) * 4)) : 0 }
  var H = T + 7 * pitch + 30, s = sx.svg(host, W, H, spec.title), svg = s.svg, cells = [], gap = pitch >= 12 ? 3 : 2
  var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  ;[1, 3, 5].forEach(function (d) { var t = sx.el('text', { class: 'sx-tick', x: L - 6, y: T + d * pitch + pitch / 2 + 3.5, 'text-anchor': 'end' }, svg); t.textContent = dn[d] })
  var lastMonthX = -99, prevM = -1
  for (var w = 0; w < weeks; w++) {
    for (var d = 0; d < 7; d++) {
      var t0 = start + (w * 7 + d) * DAY
      if (t0 < first || t0 > last) continue
      var dt = new Date(t0), x = L + w * pitch, v = byDate[t0] || 0, lv = level(v)
      if (dt.getUTCDate() <= 7 && dt.getUTCMonth() !== prevM && x - lastMonthX >= 28) {
        var mt = sx.el('text', { class: 'sx-tick', x: x, y: T - 6 }, svg); mt.textContent = mon[dt.getUTCMonth()]
        lastMonthX = x
      }
      if (dt.getUTCDate() <= 7) prevM = dt.getUTCMonth()
      var c = sx.el('rect', { class: 'sx-mark', x: x, y: T + d * pitch, width: pitch - gap, height: pitch - gap, rx: 2, style: 'fill:' + (lv ? sx.seq(0.2 + lv * 0.2) : 'var(--fill2)') }, svg)
      sx.hover(c, sx.tipRows(dn[d] + ' ' + mon[dt.getUTCMonth()] + ' ' + dt.getUTCDate() + ', ' + dt.getUTCFullYear(), [[spec.name || 'Value', sx.fmt(v, spec.unit), lv ? sx.seq(0.2 + lv * 0.2) : null]]))
      cells.push(c)
    }
  }
  var ky = T + 7 * pitch + 12, kx = W - R - 5 * 16 - 8 - 70
  var a = sx.el('text', { class: 'sx-tick', x: kx, y: ky + 9, 'text-anchor': 'end' }, svg); a.textContent = 'Less'
  for (var k = 0; k < 5; k++) sx.el('rect', { x: kx + 8 + k * 16, y: ky, width: 12, height: 12, rx: 2, style: 'fill:' + (k ? sx.seq(0.2 + k * 0.2) : 'var(--fill2)') }, svg)
  var b = sx.el('text', { class: 'sx-tick', x: kx + 8 + 5 * 16 + 4, y: ky + 9 }, svg); b.textContent = 'More'
  sx.enter(cells, 'sx-fade', 2)
}

/** kind name -> function */
export const KINDS = { histogram: histogram, boxplot: boxplot, box: boxplot, heatmap: heatmap, calendar: calendar }
