// Chart kinds: network, flow, tree. Same rules as charts-basic.mjs: each function runs in the iframe via toString(),
// self-contained, only `sx`, `host`, `spec` and globals.
/* eslint-disable no-var */

/** {kind:'network', nodes:[{id, label?, group?, size?}], edges:[{from, to, weight?}], title?, height?} */
export function network(sx, host, spec) {
  var nodes = spec.nodes, edges = spec.edges || []
  sx.need(Array.isArray(nodes) && nodes.length, 'Network needs a nodes array of {id, label?, group?, size?}.')
  sx.need(Array.isArray(edges), 'Network edges must be an array of {from, to, weight?}.')
  var n = nodes.length, ix = {}
  nodes.forEach(function (nd, i) { sx.need(nd && nd.id != null, 'Every network node needs an id.'); ix[nd.id] = i })
  var E = edges.map(function (e) {
    sx.need(ix[e.from] != null && ix[e.to] != null, 'Network edge ' + e.from + ' -> ' + e.to + ' points at an id that is not in nodes.')
    return { a: ix[e.from], b: ix[e.to], w: sx.num(e.weight) ? e.weight : 1 }
  })
  var deg = nodes.map(function () { return 0 }), nb = nodes.map(function () { return {} })
  E.forEach(function (e) { deg[e.a]++; deg[e.b]++; nb[e.a][e.b] = 1; nb[e.b][e.a] = 1 })
  var size = nodes.map(function (nd, i) { return sx.num(nd.size) && nd.size > 0 ? nd.size : 1 + deg[i] })
  var maxS = Math.max.apply(null, size), maxW = Math.max.apply(null, E.map(function (e) { return e.w }).concat(1))
  var R = size.map(function (s) { return 5 + 9 * Math.sqrt(s / maxS) })
  // groups: first appearance order, past the 8 slots they fold into the last slot, named "Other"
  var gl = [], gi = nodes.map(function (nd) {
    if (nd.group == null) return 0
    var k = gl.indexOf(String(nd.group)); if (k < 0) { gl.push(String(nd.group)); k = gl.length - 1 }
    return Math.min(k, 7)
  })
  var gnames = gl.slice(0, 8); if (gl.length > 8) gnames[7] = 'Other'
  var col = function (i) { return gl.length ? sx.color(gi[i]) : 'var(--c1)' }

  var W = sx.W || 640, H = spec.height || (W < 420 ? 320 : 400), M = 22
  // deterministic force layout: seeded start, fixed 300 iterations with cooling
  var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  var px = [], py = []
  nodes.forEach(function (_, i) { var a = (i / n) * 6.2832, r = 0.3 * Math.min(W, H); px[i] = W / 2 + r * Math.cos(a) + rnd() * 6; py[i] = H / 2 + r * Math.sin(a) + rnd() * 6 })
  var k = 0.75 * Math.sqrt((W * H) / n), N = 300
  for (var it = 0; it < N; it++) {
    var t = (W / 8) * (1 - it / N) + 0.5, dx = [], dy = []
    for (var i = 0; i < n; i++) { dx[i] = 0; dy[i] = 0 }
    for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var ex = px[i] - px[j], ey = py[i] - py[j], d = Math.sqrt(ex * ex + ey * ey) || 0.01, f = (k * k) / d / d
      dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f
    }
    E.forEach(function (e) {
      var ex = px[e.a] - px[e.b], ey = py[e.a] - py[e.b], d = Math.sqrt(ex * ex + ey * ey) || 0.01, f = (d / k) * (0.6 + 0.4 * (e.w / maxW))
      dx[e.a] -= ex * f; dy[e.a] -= ey * f; dx[e.b] += ex * f; dy[e.b] += ey * f
    })
    for (i = 0; i < n; i++) {
      dx[i] -= (px[i] - W / 2) * 0.04; dy[i] -= (py[i] - H / 2) * 0.04
      var m = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01, s = Math.min(m, t) / m
      px[i] += dx[i] * s; py[i] += dy[i] * s
    }
  }
  // fit the settled layout into the box
  var x0 = Math.min.apply(null, px), x1 = Math.max.apply(null, px), y0 = Math.min.apply(null, py), y1 = Math.max.apply(null, py)
  var fx = sx.lin(x0, x1, M + 14, W - M - 14), fy = sx.lin(y0, y1, M, H - M)
  for (i = 0; i < n; i++) { px[i] = n === 1 ? W / 2 : fx(px[i]); py[i] = n === 1 ? H / 2 : fy(py[i]) }

  var s0 = sx.svg(host, W, H, spec.title), svg = s0.svg
  var eg = sx.el('g', {}, svg), ng = sx.el('g', {}, svg), lg = sx.el('g', { 'pointer-events': 'none' }, svg)
  var lines = E.map(function (e) { return sx.el('line', { style: 'stroke:var(--faint);stroke-width:' + (1 + 2 * (e.w / maxW)).toFixed(2) + ';stroke-linecap:round' }, eg) })
  var order = size.map(function (_, i) { return i }).sort(function (a, b) { return size[b] - size[a] || a - b })
  var nLab = n <= 14 ? n : W < 420 ? 6 : 10, labelled = {}
  order.slice(0, nLab).forEach(function (i) { labelled[i] = 1 })
  var circles = [], texts = []
  nodes.forEach(function (nd, i) {
    var c = sx.el('circle', { r: R[i], style: 'fill:' + col(i) + ';stroke:var(--surface);stroke-width:2;cursor:grab;touch-action:none' }, ng)
    circles.push(c)
    if (labelled[i]) { var tx = sx.el('text', { class: 'sx-label', style: 'paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round' }, lg); tx.textContent = String(nd.label != null ? nd.label : nd.id); texts[i] = tx }
    sx.hover(c, function () {
      return sx.tipRows(nd.label != null ? nd.label : nd.id, [].concat(nd.group != null ? [['Group', String(nd.group), col(i)]] : [], [['Connections', String(deg[i])]], nd.size != null ? [['Size', sx.fmt(+nd.size, spec.unit)]] : []))
    })
  })
  var refresh = function () {
    circles.forEach(function (c, i) { c.setAttribute('cx', px[i].toFixed(1)); c.setAttribute('cy', py[i].toFixed(1)) })
    E.forEach(function (e, q) { var l = lines[q]; l.setAttribute('x1', px[e.a].toFixed(1)); l.setAttribute('y1', py[e.a].toFixed(1)); l.setAttribute('x2', px[e.b].toFixed(1)); l.setAttribute('y2', py[e.b].toFixed(1)) })
    texts.forEach(function (tx, i) {
      if (!tx) return
      var right = px[i] < W - 90
      tx.setAttribute('x', (px[i] + (right ? R[i] + 5 : -R[i] - 5)).toFixed(1)); tx.setAttribute('y', (py[i] + 4).toFixed(1)); tx.setAttribute('text-anchor', right ? 'start' : 'end')
    })
  }
  refresh()
  var focus = function (f) {
    circles.forEach(function (c, i) { c.style.opacity = f == null || i === f || nb[f][i] ? 1 : 0.2; if (texts[i]) texts[i].style.opacity = f == null || i === f || nb[f][i] ? 1 : 0.2 })
    E.forEach(function (e, q) { var on = f != null && (e.a === f || e.b === f); lines[q].style.opacity = f == null ? 1 : on ? 1 : 0.08; lines[q].style.stroke = on ? 'var(--muted)' : 'var(--faint)' })
  }
  var dragging = -1
  circles.forEach(function (c, i) {
    c.addEventListener('pointerenter', function () { if (dragging < 0) focus(i) })
    c.addEventListener('pointerleave', function () { if (dragging < 0) focus(null) })
    c.addEventListener('pointerdown', function (ev) { dragging = i; c.setPointerCapture(ev.pointerId); c.style.cursor = 'grabbing'; focus(i); ev.preventDefault() })
    c.addEventListener('pointermove', function (ev) {
      if (dragging !== i) return
      var r = svg.getBoundingClientRect()
      px[i] = Math.max(R[i], Math.min(W - R[i], ((ev.clientX - r.left) / r.width) * W)); py[i] = Math.max(R[i], Math.min(H - R[i], ((ev.clientY - r.top) / r.height) * H))
      refresh()
    })
    var up = function () { if (dragging !== i) return; dragging = -1; c.style.cursor = 'grab' }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up)
  })
  sx.enter(lines, 'sx-fade', 4)
  sx.enter(circles, 'sx-pop', 10)
  if (gl.length) sx.legend(host, gnames)
}

/** {kind:'flow', direction?:'LR'|'TB', nodes:[{id, label, shape?:'box'|'pill'|'diamond'}], edges:[{from, to, label?}], title?} */
export function flow(sx, host, spec) {
  var nodes = spec.nodes, edges = spec.edges || []
  sx.need(Array.isArray(nodes) && nodes.length, 'Flow needs a nodes array of {id, label, shape?}.')
  sx.need(Array.isArray(edges), 'Flow edges must be an array of {from, to, label?}.')
  var n = nodes.length, ix = {}
  nodes.forEach(function (nd, i) { sx.need(nd && nd.id != null, 'Every flow node needs an id.'); ix[nd.id] = i })
  var tw = function (s) { return Math.ceil(6.3 * String(s).length) }
  var E = []
  edges.forEach(function (e) {
    sx.need(ix[e.from] != null && ix[e.to] != null, 'Flow edge ' + e.from + ' -> ' + e.to + ' points at an id that is not in nodes.')
    if (ix[e.from] !== ix[e.to]) E.push({ a: ix[e.from], b: ix[e.to], label: e.label })
  })
  var B = nodes.map(function (nd) {
    var lab = String(nd.label != null ? nd.label : nd.id), dia = nd.shape === 'diamond'
    return { lab: lab, shape: nd.shape || 'box', w: dia ? Math.max(96, Math.round(tw(lab) * 1.7) + 24) : Math.max(72, tw(lab) + 28), h: dia ? 54 : 34 }
  })
  // layering: longest path; cycles are broken by flipping back edges for layout only
  var outs = nodes.map(function () { return [] }), indeg = nodes.map(function () { return 0 })
  E.forEach(function (e) { outs[e.a].push(e); indeg[e.b]++ })
  var st = [], dfs = function (u) { st[u] = 1; outs[u].forEach(function (e) { if (st[e.b] === 1) e.rev = true; else if (!st[e.b]) dfs(e.b) }); st[u] = 2 }
  nodes.forEach(function (_, i) { if (!indeg[i] && !st[i]) dfs(i) })
  nodes.forEach(function (_, i) { if (!st[i]) dfs(i) })
  var preds = nodes.map(function () { return [] }), succs = nodes.map(function () { return [] })
  E.forEach(function (e) { var u = e.rev ? e.b : e.a, v = e.rev ? e.a : e.b; e.u = u; e.v = v; preds[v].push(u); succs[u].push(v) })
  var layer = [], lay = function (v) { if (layer[v] == null) layer[v] = preds[v].length ? 1 + Math.max.apply(null, preds[v].map(lay)) : 0; return layer[v] }
  nodes.forEach(function (_, i) { lay(i) })
  var L = []; layer.forEach(function (l, i) { (L[l] = L[l] || []).push(i) })
  var pos = function () { var p = []; L.forEach(function (a) { a.forEach(function (v, i) { p[v] = i }) }); return p }
  var sweep = function (l, nbr) {
    var p = pos(), bc = {}
    L[l].forEach(function (v) { var ns = nbr[v]; bc[v] = ns.length ? ns.reduce(function (a, u) { return a + p[u] }, 0) / ns.length : p[v] })
    L[l] = L[l].map(function (v, i) { return [v, i] }).sort(function (a, b) { return bc[a[0]] - bc[b[0]] || a[1] - b[1] }).map(function (x) { return x[0] })
  }
  for (var r = 0; r < 4; r++) { for (var l = 1; l < L.length; l++) sweep(l, preds); for (l = L.length - 2; l >= 0; l--) sweep(l, succs) }
  var maxLab = Math.max.apply(null, E.map(function (e) { return e.label ? tw(e.label) + 10 : 0 }).concat(0))

  var W = sx.W || 640, PAD = 10
  var place = function (dir) {
    var lr = dir === 'LR', gapA = lr ? Math.max(52, maxLab + 28) : maxLab ? 46 : 40, gapC = 16
    var A = function (v) { return lr ? B[v].w : B[v].h }, C = function (v) { return lr ? B[v].h : B[v].w }
    var cs = L.map(function (a) { return a.reduce(function (s, v) { return s + C(v) }, 0) + gapC * (a.length - 1) }), maxC = Math.max.apply(null, cs)
    var off = PAD, P = []
    L.forEach(function (a, li) {
      var along = Math.max.apply(null, a.map(A)), c = PAD + (maxC - cs[li]) / 2
      a.forEach(function (v) { P[v] = lr ? [off + along / 2, c + C(v) / 2] : [c + C(v) / 2, off + along / 2]; c += C(v) + gapC })
      off += along + gapA
    })
    var tot = off - gapA + PAD
    return { P: P, w: lr ? tot : maxC + 2 * PAD, h: lr ? maxC + 2 * PAD : tot, dir: dir }
  }
  var want = spec.direction === 'TB' ? 'TB' : 'LR', g = place(want)
  // a left-to-right chart wider than the box turns top-down instead of shrinking its text
  if (want === 'LR' && g.w > W) { var g2 = place('TB'); if (g2.w < g.w) g = g2 }
  var VW = Math.max(W, g.w), VH = g.h, ox = (VW - g.w) / 2, lr = g.dir === 'LR'
  var s0 = sx.svg(host, VW, VH, spec.title), svg = s0.svg
  var mid = 'sxa' + Math.floor(Math.random() * 1e9)
  var defs = sx.el('defs', {}, svg), mk = sx.el('marker', { id: mid, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs)
  sx.el('path', { d: 'M0,0.5L7.5,4L0,7.5z', style: 'fill:var(--muted)' }, mk)
  var eg = sx.el('g', {}, svg), ng = sx.el('g', {}, svg), cg = sx.el('g', {}, svg)
  var edgeEls = [], chips = [], nodeEls = []
  var X = function (v) { return g.P[v][0] + ox }, Y = function (v) { return g.P[v][1] }
  E.forEach(function (e) {
    var u = e.u, v = e.v, d, mx, my
    if (e.rev) {
      // a back edge (a loop) runs around the side so it never sits on the forward edge between the same nodes
      var bend = 44
      if (lr) { var ba = Y(u) + B[u].h / 2, bb = Y(v) + B[v].h / 2 + 1, bx = X(u), bx2 = X(v); d = 'M' + bx + ',' + ba + 'C' + bx + ',' + (ba + bend) + ' ' + bx2 + ',' + (bb + bend) + ' ' + bx2 + ',' + bb; mx = (bx + bx2) / 2; my = Math.max(ba, bb) + bend * 0.75 }
      else { var ra = X(u) + B[u].w / 2, rb = X(v) + B[v].w / 2 + 1, ry = Y(u), ry2 = Y(v); d = 'M' + ra + ',' + ry + 'C' + (ra + bend) + ',' + ry + ' ' + (rb + bend) + ',' + ry2 + ' ' + rb + ',' + ry2; mx = Math.max(ra, rb) + bend * 0.75; my = (ry + ry2) / 2 }
    } else if (lr) {
      var xa = X(u) + B[u].w / 2, xb = X(v) - B[v].w / 2 - 1, ya = Y(u), yb = Y(v), m = (xa + xb) / 2
      d = 'M' + xa + ',' + ya + 'C' + m + ',' + ya + ' ' + m + ',' + yb + ' ' + xb + ',' + yb; mx = m; my = (ya + yb) / 2
    } else {
      var ya2 = Y(u) + B[u].h / 2, yb2 = Y(v) - B[v].h / 2 - 1, xa2 = X(u), xb2 = X(v), m2 = (ya2 + yb2) / 2
      d = 'M' + xa2 + ',' + ya2 + 'C' + xa2 + ',' + m2 + ' ' + xb2 + ',' + m2 + ' ' + xb2 + ',' + yb2; mx = (xa2 + xb2) / 2; my = m2
    }
    var p = sx.el('path', { d: d, pathLength: 1, style: 'fill:none;stroke:var(--muted);stroke-width:1.25;stroke-linecap:round;opacity:.7', 'marker-end': e.rev ? null : 'url(#' + mid + ')', 'marker-start': e.rev ? 'url(#' + mid + ')' : null }, eg)
    edgeEls.push(p)
    var tip = function () { return sx.tipRows(B[e.a].lab + ' → ' + B[e.b].lab, e.label ? [['Label', String(e.label)]] : []) }
    var hit = sx.el('path', { d: d, style: 'fill:none;stroke:transparent;stroke-width:12' }, eg)
    sx.hover(hit, tip)
    if (e.label) {
      var cw = tw(e.label) + 10, chip = sx.el('g', { 'pointer-events': 'none' }, cg)
      sx.el('rect', { x: mx - cw / 2, y: my - 9, width: cw, height: 18, rx: 5, style: 'fill:var(--surface)' }, chip)
      var tx = sx.el('text', { class: 'sx-label is-muted', x: mx, y: my + 4, 'text-anchor': 'middle' }, chip); tx.textContent = String(e.label)
      chips.push(chip)
    }
  })
  nodes.forEach(function (nd, v) {
    var b = B[v], gg = sx.el('g', { class: 'sx-mark', transform: 'translate(' + X(v) + ',' + Y(v) + ')' }, ng), w = b.w, h = b.h
    var shp = function (fill, stroke) {
      var st2 = 'fill:' + fill + ';stroke:' + stroke + ';stroke-width:1'
      return b.shape === 'diamond' ? sx.el('polygon', { points: '0,' + -h / 2 + ' ' + w / 2 + ',0 0,' + h / 2 + ' ' + -w / 2 + ',0', style: st2, 'stroke-linejoin': 'round' }, gg)
        : sx.el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: b.shape === 'pill' ? h / 2 : 8, style: st2 }, gg)
    }
    shp('var(--surface)', 'none'); shp('var(--card)', 'var(--line2)')
    var t = sx.el('text', { class: 'sx-label', y: 4, 'text-anchor': 'middle' }, gg); t.textContent = b.lab
    var ins = nodes.length ? E.filter(function (e) { return e.b === v }).length : 0, outc = E.filter(function (e) { return e.a === v }).length
    sx.hover(gg, sx.tipRows(b.lab, [['Incoming', String(ins)], ['Outgoing', String(outc)]]))
    nodeEls.push(gg)
  })
  sx.enter(edgeEls, 'sx-draw', 30)
  sx.enter(chips, 'sx-fade', 30)
  sx.enter(nodeEls, 'sx-in', 30)
}

/** {kind:'tree', root:{label, value?, children:[...]}, title?}  click a node with children to collapse or expand it */
export function tree(sx, host, spec) {
  var root = spec.root
  sx.need(root && typeof root === 'object' && root.label != null, 'Tree needs a root {label, children:[...]}.')
  var all = [], walk = function (nd, depth, par) {
    nd._d = depth; nd._p = par; nd._id = all.length; all.push(nd)
    ;(nd.children || []).forEach(function (c) { walk(c, depth + 1, nd) })
  }
  walk(root, 0, null)
  all.forEach(function (nd) { if (nd._c === undefined) nd._c = all.length > 40 && nd._d >= 2 && !!(nd.children || []).length })
  var count = function (nd) { return (nd.children || []).reduce(function (a, c) { return a + 1 + count(c) }, 0) }
  var tw = function (s) { return Math.ceil(6.3 * s.length) }
  var text = function (nd) { var s = String(nd.label); return s.length > 26 ? s.slice(0, 25) + '…' : s }
  var W = sx.W || 640, ROW = 26, PAD = 14, GAP = 34, R = 4.5
  var s0 = sx.svg(host, W, 100, spec.title), svg = s0.svg
  var lg = sx.el('g', {}, svg), ng = sx.el('g', {}, svg)
  var els = {}, cur = {}, raf = 0, vis = []
  var layout = function () {
    vis = []; var row = 0
    var place = function (nd) {
      vis.push(nd)
      var ch = nd._c ? [] : nd.children || []
      if (!ch.length) nd._y = row++
      else { ch.forEach(place); nd._y = (ch[0]._y + ch[ch.length - 1]._y) / 2 }
    }
    place(root)
    var lw = []
    vis.forEach(function (nd) { lw[nd._d] = Math.max(lw[nd._d] || 0, tw(text(nd)) + (nd._c ? 34 : 0)) })
    var xs = [], x = PAD
    lw.forEach(function (w, d) { xs[d] = x; x += 12 + w + GAP })
    vis.forEach(function (nd) { nd._x = xs[nd._d]; nd._ty = PAD + nd._y * ROW + ROW / 2 - 6 })
    var total = x - GAP + PAD
    // shortcut: a tree wider than the box shrinks to fit; upgrade by wrapping labels
    var vw = Math.max(W, total), vh = PAD * 2 + row * ROW - 12
    svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh)
  }
  var ease = function (t) { return 1 - Math.pow(1 - t, 3) }
  var linkD = function (a, b, na, nb) {
    var x0 = a.x + 12 + tw(text(na)) + (na._c ? 34 : 0) - (na._c ? 0 : 0), x1 = b.x - 8, m = (x0 + x1) / 2
    return 'M' + x0.toFixed(1) + ',' + a.y.toFixed(1) + 'C' + m.toFixed(1) + ',' + a.y.toFixed(1) + ' ' + m.toFixed(1) + ',' + b.y.toFixed(1) + ' ' + x1.toFixed(1) + ',' + b.y.toFixed(1)
  }
  var apply = function (from, t) {
    vis.forEach(function (nd) {
      var f = from[nd._id], p = cur[nd._id] = { x: f.x + (nd._x - f.x) * t, y: f.y + (nd._ty - f.y) * t }
      els[nd._id].g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')')
    })
    vis.forEach(function (nd) { if (nd._p) els[nd._id].link.setAttribute('d', linkD(cur[nd._p._id], cur[nd._id], nd._p, nd)) })
  }
  var build = function (nd) {
    var e = els[nd._id]
    if (!e) {
      var g = sx.el('g', {}, ng), link = nd._p ? sx.el('path', { style: 'fill:none;stroke:var(--line2);stroke-width:1.25' }, lg) : null
      var hit = sx.el('rect', { x: -8, y: -ROW / 2 + 1, height: ROW - 2, fill: 'transparent' }, g)
      var dot = sx.el('circle', { r: R }, g), t = sx.el('text', { class: 'sx-label', x: 11, y: 4 }, g), cnt = sx.el('text', { class: 'sx-tick', y: 4 }, g)
      e = els[nd._id] = { g: g, link: link, hit: hit, dot: dot, t: t, cnt: cnt }
      var kids = (nd.children || []).length
      if (kids) { g.style.cursor = 'pointer'; g.addEventListener('click', function () { nd._c = !nd._c; update() }) }
      sx.hover(g, function () {
        var rows = [], k = count(nd); if (nd.value != null) rows.push(['Value', sx.fmt(nd.value, spec.unit)])
        if (kids) rows.push(['Children', String(kids)], ['Descendants', String(k)])
        return sx.tipRows(nd.label, rows.concat([['Depth', String(nd._d)]]))
      })
    }
    var kids2 = (nd.children || []).length, txt = text(nd)
    e.t.textContent = txt
    e.hit.setAttribute('width', 8 + 11 + tw(txt) + (nd._c ? 34 : 0) + 4)
    e.dot.setAttribute('style', kids2 && !nd._c ? 'fill:var(--surface);stroke:var(--c1);stroke-width:1.75' : 'fill:' + (kids2 ? 'var(--c1)' : 'var(--faint)') + ';stroke:none')
    e.cnt.textContent = nd._c ? '+' + count(nd) : ''
    e.cnt.setAttribute('x', 11 + tw(txt) + 6)
  }
  var update = function () {
    var from = {}, prev = cur
    layout()
    var keep = {}; vis.forEach(function (nd) { keep[nd._id] = 1 })
    Object.keys(els).forEach(function (k) { if (!keep[k]) { els[k].g.remove(); if (els[k].link) els[k].link.remove(); delete els[k]; delete cur[k] } })
    var first = !Object.keys(prev).length
    vis.forEach(function (nd) {
      build(nd)
      var p = prev[nd._id] || (nd._p && prev[nd._p._id]) || { x: nd._x, y: nd._ty }
      from[nd._id] = p
    })
    cancelAnimationFrame(raf)
    if (sx.reduce || first) { apply(from, 1); return }
    var t0 = performance.now(), step = function (now) {
      var t = Math.min(1, (now - t0) / 380); apply(from, ease(t))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }
  update()
  sx.enter(Object.keys(els).map(function (k) { return els[k].g }), 'sx-in', 14)
  sx.enter(Object.keys(els).map(function (k) { return els[k].link }).filter(Boolean), 'sx-fade', 14)
}

/** kind name -> function */
export const KINDS = { network, graph: network, flow, flowchart: flow, diagram: flow, tree }
