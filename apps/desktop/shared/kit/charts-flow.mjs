// Chart kinds: sankey, funnel, waterfall, treemap. Same rules as charts-basic.mjs: each function runs in the iframe via toString(),
// self-contained, only `sx`, `host`, `spec` and globals.
/* eslint-disable no-var */

/** {kind:'sankey', nodes?:[name..], links:[{source, target, value}] (names or indexes), unit?, height?} */
export function sankey(sx, host, spec) {
  var links = spec.links
  sx.need(Array.isArray(links) && links.length && links.every(function (l) { return l && l.source != null && l.target != null && sx.num(l.value) && l.value > 0 }), 'Sankey needs links: [{source, target, value}] with values > 0.')
  var names = (spec.nodes || []).map(function (n) { return typeof n === 'object' && n ? n.name != null ? n.name : n.label : n })
  var id = function (r) { if (typeof r === 'number' && names[r] != null) return r; var i = names.indexOf(r); if (i < 0) { names.push(r); i = names.length - 1 } return i }
  var L = links.map(function (l) { return { s: id(l.source), t: id(l.target), v: l.value } })
  var N = names.map(function (n, i) { return { name: String(n), i: i, inn: [], out: [], depth: 0 } })
  L.forEach(function (l) { sx.need(l.s !== l.t, 'Sankey links cannot point from a node to itself.'); N[l.s].out.push(l); N[l.t].inn.push(l) })
  for (var pass = 0; pass < N.length; pass++) L.forEach(function (l) { if (N[l.t].depth < N[l.s].depth + 1 && N[l.s].depth < N.length) N[l.t].depth = N[l.s].depth + 1 })
  sx.need(N.every(function (n) { return n.depth < N.length }), 'Sankey links form a loop; use a flow without cycles.')
  var sum = function (a) { return a.reduce(function (t, l) { return t + l.v }, 0) }
  N.forEach(function (n) { n.v = Math.max(sum(n.inn), sum(n.out)) })
  var cols = [], D = 0
  N.forEach(function (n) { D = Math.max(D, n.depth); (cols[n.depth] = cols[n.depth] || []).push(n) })
  // colours: first 8 nodes (by depth) own a hue, later ones inherit their biggest parent's
  var c = 0
  N.slice().sort(function (a, b) { return a.depth - b.depth }).forEach(function (n) {
    if (c < 8) n.col = sx.color(c++)
    else { var p = n.inn.slice().sort(function (a, b) { return b.v - a.v })[0]; n.col = p ? N[p.s].col : 'var(--faint)' }
  })
  var W = sx.W || 640, narrow = W < 460, nw = 10, padX = 8, labW = narrow ? 70 : 120
  var gap = 10, maxN = Math.max.apply(null, cols.map(function (a) { return a.length }))
  var H = spec.height || Math.max(240, maxN * 38)
  var k = Math.min.apply(null, cols.map(function (a) { return (H - 16 - gap * (a.length - 1)) / (sum(a.map(function (n) { return { v: n.v } })) || 1) }))
  var x0 = padX, x1 = W - padX - nw - Math.min(labW, 6.2 * Math.max.apply(null, (cols[D] || []).map(function (n) { return n.name.length })) + 8), span = D ? (x1 - x0) / D : 0
  var sv = sx.svg(host, W, H, spec.title).svg
  cols.forEach(function (a) {
    var h = sum(a.map(function (n) { return { v: n.v } })) * k + gap * (a.length - 1), y = (H - h) / 2
    a.forEach(function (n) { n.y = y; n.h = Math.max(2, n.v * k); n.x = x0 + n.depth * span; y += n.h + gap })
  })
  N.forEach(function (n) {
    var oy = n.y, iy = n.y
    n.out.sort(function (a, b) { return N[a.t].y - N[b.t].y }).forEach(function (l) { l.sy = oy; l.w = Math.max(1, l.v * k); oy += l.w })
    n.inn.sort(function (a, b) { return N[a.s].y - N[b.s].y }).forEach(function (l) { l.ty = iy; iy += Math.max(1, l.v * k) })
  })
  var marks = [], total = sum(cols[0] ? cols[0].map(function (n) { return { v: n.v } }) : [])
  L.forEach(function (l) {
    var a = N[l.s], b = N[l.t], xa = a.x + nw, xb = b.x, m = (xa + xb) / 2, w = l.w
    var d = 'M' + xa + ',' + l.sy + 'C' + m + ',' + l.sy + ' ' + m + ',' + l.ty + ' ' + xb + ',' + l.ty + 'V' + (l.ty + w) + 'C' + m + ',' + (l.ty + w) + ' ' + m + ',' + (l.sy + w) + ' ' + xa + ',' + (l.sy + w) + 'Z'
    var p = sx.el('path', { class: 'sx-mark', d: d, style: 'fill:' + a.col + ';fill-opacity:.32' }, sv)
    sx.hover(p, sx.tipRows(a.name + ' → ' + b.name, [[sx.fmt(l.v, spec.unit), Math.round(l.v / a.v * 100) + '% of ' + a.name, a.col]]))
    marks.push(p)
  })
  var nodes = N.map(function (n) {
    var r = sx.el('rect', { class: 'sx-mark', x: n.x, y: n.y, width: nw, height: n.h, rx: 2, style: 'fill:' + n.col }, sv)
    sx.hover(r, sx.tipRows(n.name, [['In', sx.fmt(sum(n.inn), spec.unit), n.col], ['Out', sx.fmt(sum(n.out), spec.unit)]]))
        var t = sx.el('text', { class: 'sx-label', x: n.x + nw + 6, y: n.y + n.h / 2 + 4 }, sv)
    t.textContent = n.name.length > labW / 6.2 ? n.name.slice(0, Math.max(3, Math.floor(labW / 6.2) - 1)) + '…' : n.name
    return r
  })
  sx.enter(marks, 'sx-fade', 40)
  sx.enter(nodes, 'sx-fade', 0)
}

/** {kind:'funnel', steps:[{label, value}], unit?} (also accepts data:[..]) */
export function funnel(sx, host, spec) {
  var st = spec.steps || spec.data
  sx.need(Array.isArray(st) && st.length > 1 && st.every(function (s) { return sx.num(s.value) && s.value >= 0 }), 'Funnel needs steps: [{label, value}] with at least two steps.')
  var W = sx.W || 640, labW = Math.min(150, Math.round(W * 0.32)), bh = 30, gap = 24, H = st.length * bh + (st.length - 1) * gap + 8
  var max = Math.max.apply(null, st.map(function (s) { return s.value })) || 1
  var ax = labW + 8, aw = W - ax - 8, cx = ax + aw / 2
  var sv = sx.svg(host, W, H, spec.title).svg, marks = []
  var cut = function (s) { var n = Math.floor((labW - 4) / 6.2); return s.length > n ? s.slice(0, n - 1) + '…' : s }
  st.forEach(function (s, i) {
    var y = 4 + i * (bh + gap), w = Math.max(3, s.value / max * aw)
    var col = sx.seq(0.9 - 0.5 * (i / (st.length - 1)))
    var r = sx.el('rect', { class: 'sx-mark', x: cx - w / 2, y: y, width: w, height: bh, rx: 4, style: 'fill:' + col }, sv)
    var pct = Math.round(s.value / st[0].value * 1000) / 10
    sx.hover(r, sx.tipRows(s.label, [[sx.fmt(s.value, spec.unit), pct + '% of ' + st[0].label, col]].concat(i ? [['Step conversion', (st[i - 1].value ? Math.round(s.value / st[i - 1].value * 1000) / 10 : 0) + '%']] : [])))
    marks.push(r)
    var t = sx.el('text', { class: 'sx-label', x: 0, y: y + bh / 2 - 2 }, sv); t.textContent = cut(String(s.label))
    var v = sx.el('text', { class: 'sx-label is-muted', x: 0, y: y + bh / 2 + 12 }, sv); v.textContent = sx.fmt(s.value, spec.unit)
    if (i) {
      var q = sx.el('text', { class: 'sx-tick', x: cx, y: y - gap / 2 + 4, 'text-anchor': 'middle' }, sv)
      q.textContent = '↓ ' + (st[i - 1].value ? Math.round(s.value / st[i - 1].value * 100) : 0) + '%'
    }
  })
  sx.enter(marks, 'sx-pop', 60)
}

/** {kind:'waterfall', steps:[{label, value}, {label, total:true, value?}], unit?} value = change; total bars show the running sum (or value) */
export function waterfall(sx, host, spec) {
  var st = spec.steps || spec.data
  sx.need(Array.isArray(st) && st.length > 1 && st.every(function (s) { return s.total || sx.num(s.value) }), 'Waterfall needs steps: [{label, value}] (add total:true for subtotal bars).')
  var run = 0, rows = st.map(function (s) {
    var a = run, b
    if (s.total) b = sx.num(s.value) ? s.value : run
    else b = run + s.value
    run = b
    return { label: String(s.label), a: s.total ? 0 : a, b: b, total: !!s.total, d: s.total ? b : s.value, from: a }
  })
  var all = [0]; rows.forEach(function (r) { all.push(r.a, r.b) })
  var f = sx.frame(host, { x: rows.map(function (r) { return r.label }), y: { min: Math.min.apply(null, all), max: Math.max.apply(null, all) }, unit: spec.unit, label: spec.title, yLabel: spec.yLabel, H: spec.height })
  var gw = Math.min(f.bw * 0.72, 56), marks = [], up = false, dn = false
  rows.forEach(function (r, i) {
    var col = r.total ? 'var(--fg)' : r.d >= 0 ? sx.color(0) : sx.color(1)
    if (!r.total) { if (r.d >= 0) up = true; else dn = true }
    var y0 = Math.min(f.Y(r.a), f.Y(r.b)), h = Math.max(1, Math.abs(f.Y(r.a) - f.Y(r.b)))
    var m = sx.el('path', { class: 'sx-mark', d: sx.barPath(f.X(i) - gw / 2, y0, gw, h, 3, 'up'), style: 'fill:' + col + (r.total ? ';fill-opacity:.55' : '') }, f.svg)
    sx.hover(m, sx.tipRows(r.label, r.total ? [['Total', sx.fmt(r.b, spec.unit), col]] : [[r.d >= 0 ? 'Increase' : 'Decrease', (r.d >= 0 ? '+' : '−') + sx.fmt(Math.abs(r.d), spec.unit), col], ['Running total', sx.fmt(r.b, spec.unit)]]))
    marks.push(m)
    if (rows.length <= 12 || gw > 36) {
      var up2 = r.total || r.d >= 0, t = sx.el('text', { class: 'sx-label is-muted', x: f.X(i), y: up2 ? y0 - 6 : y0 + h + 14, 'text-anchor': 'middle' }, f.svg)
      t.textContent = r.total ? sx.fmt(r.b, spec.unit) : (r.d >= 0 ? '+' : '−') + sx.fmt(Math.abs(r.d), spec.unit)
    }
    if (i < rows.length - 1) sx.el('line', { x1: f.X(i) + gw / 2, x2: f.X(i + 1) - gw / 2, y1: f.Y(r.b), y2: f.Y(r.b), style: 'stroke:var(--faint);stroke-width:1;stroke-dasharray:3 3' }, f.svg)
  })
  sx.enter(marks, 'sx-grow-y', Math.max(10, 400 / marks.length))
  if (up && dn) sx.legend(host, ['Increase', 'Decrease'])
}

/** {kind:'treemap', data:[{label, value, group?}] or nested [{label, children:[..]}], unit?, height?} */
export function treemap(sx, host, spec) {
  var data = spec.data || spec.children
  sx.need(Array.isArray(data) && data.length, 'Treemap needs data: [{label, value, group?}] or nested {label, children}.')
  var leaves = [], groups = []
  var walk = function (n, g) {
    if (Array.isArray(n.children) && n.children.length) n.children.forEach(function (c) { walk(c, g != null ? g : n.label) })
    else if (sx.num(n.value) && n.value > 0) leaves.push({ label: String(n.label), value: n.value, group: g != null ? g : n.group })
  }
  data.forEach(function (n) { walk(n, null) })
  sx.need(leaves.length, 'Treemap needs at least one item with a value above 0.')
  leaves.forEach(function (l) { if (l.group != null && groups.indexOf(l.group) < 0) groups.push(l.group) })
  sx.need(groups.length <= 8, 'Treemap has more than 8 groups; merge the smaller ones.')
  // squarified layout of items [{value}] into a rect; returns rects aligned to items (sorted desc)
  var squarify = function (items, x, y, w, h) {
    var out = [], tot = items.reduce(function (a, b) { return a + b.value }, 0), sc = w * h / tot, rest = items.slice()
    var worst = function (row, side) { var s = row.reduce(function (a, b) { return a + b.value * sc }, 0), mx = Math.max.apply(null, row.map(function (r) { return r.value * sc })), mn = Math.min.apply(null, row.map(function (r) { return r.value * sc })); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)) }
    while (rest.length) {
      var side = Math.min(w, h), row = [rest[0]], i = 1
      while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) row.push(rest[i++])
      rest = rest.slice(row.length)
      var s = row.reduce(function (a, b) { return a + b.value * sc }, 0), th = s / side, o = 0
      row.forEach(function (it) {
        var len = it.value * sc / th
        out.push(w >= h ? { it: it, x: x, y: y + o, w: th, h: len } : { it: it, x: x + o, y: y, w: len, h: th })
        o += len
      })
      if (w >= h) { x += th; w -= th } else { y += th; h -= th }
    }
    return out
  }
  var W = sx.W || 640, H = spec.height || Math.round(Math.max(220, Math.min(420, W * 0.6)))
  var sv = sx.svg(host, W, H, spec.title).svg, marks = []
  var byDesc = function (a, b) { return b.value - a.value }
  var cells = []
  if (groups.length) {
    var gs = groups.map(function (g) { var m = leaves.filter(function (l) { return l.group === g }); return { g: g, items: m.sort(byDesc), value: m.reduce(function (a, b) { return a + b.value }, 0) } })
    var ungrouped = leaves.filter(function (l) { return l.group == null })
    sx.need(!ungrouped.length, 'Treemap: give every item a group, or none.')
    squarify(gs.sort(byDesc), 0, 0, W, H).forEach(function (r) {
      squarify(r.it.items, r.x, r.y, r.w, r.h).forEach(function (c) { c.col = sx.color(groups.indexOf(r.it.g)); c.it.gname = r.it.g; cells.push(c) })
    })
  } else {
    var mx = Math.max.apply(null, leaves.map(function (l) { return l.value }))
    squarify(leaves.slice().sort(byDesc), 0, 0, W, H).forEach(function (c) { c.col = sx.seq(0.25 + 0.65 * c.it.value / mx); cells.push(c) })
  }
  var tot = leaves.reduce(function (a, b) { return a + b.value }, 0)
  cells.forEach(function (c) {
    var r = sx.el('rect', { class: 'sx-mark', x: c.x, y: c.y, width: Math.max(0, c.w), height: Math.max(0, c.h), rx: 3, style: 'fill:' + c.col + ';stroke:var(--surface);stroke-width:2' }, sv)
    sx.hover(r, sx.tipRows(c.it.label, [[sx.fmt(c.it.value, spec.unit), Math.round(c.it.value / tot * 1000) / 10 + '%', c.col]].concat(c.it.gname != null ? [['Group', c.it.gname]] : [])))
    marks.push(r)
    var lw = c.it.label.length * 6.4 + 14
    if (c.w >= lw && c.h >= 20) {
      // label ink for a coloured fill: white, dark on yellow (palette rule); --on-cN pairs with --cN
      var on = /--c\d/.test(c.col) ? c.col.replace('--c', '--on-c') : 'var(--fg)'
      var t = sx.el('text', { class: 'sx-label', x: c.x + 8, y: c.y + 16, style: 'fill:' + on }, sv); t.textContent = c.it.label
      if (c.h >= 38) { var v = sx.el('text', { class: 'sx-tick', x: c.x + 8, y: c.y + 31, style: 'fill:' + on + ';fill-opacity:.75' }, sv); v.textContent = sx.fmt(c.it.value, spec.unit) }
    }
  })
  sx.enter(marks, 'sx-fade', Math.max(6, 300 / marks.length))
  if (groups.length) sx.legend(host, groups.map(String))
}

export const KINDS = { sankey, funnel, waterfall, treemap }
