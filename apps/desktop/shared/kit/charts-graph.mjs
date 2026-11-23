// Chart kinds: network, flow, tree. Same rules as charts-basic.mjs: each function runs in the iframe via toString(),
// self-contained, only `sx`, `host`, `spec` and globals.
/* eslint-disable no-var */

/** {kind:'network', nodes:[{id, label?, group?, size?}], edges:[{from, to, weight?}], directed?, title?, height?} */
// Drawn like the app's Obsidian-style notes graph (shared/graph.mjs): same forces, small nodes, hairline links,
// labels under the nodes; hover lights a node's links and fades the rest to 20%; nodes drag and the graph settles live.
export function network(sx, host, spec) {
  var nodes = spec.nodes, edges = spec.edges || []
  sx.need(Array.isArray(nodes) && nodes.length, 'Network needs a nodes array of {id, label?, group?, size?}.')
  sx.need(Array.isArray(edges), 'Network edges must be an array of {from, to, weight?}.')
  var n = nodes.length, ix = {}
  nodes.forEach(function (nd, i) { sx.need(nd && nd.id != null, 'Every network node needs an id.'); ix[nd.id] = i })
  var E = []
  edges.forEach(function (e) {
    sx.need(e && ix[e.from] != null && ix[e.to] != null, 'Network edge ' + (e && e.from) + ' -> ' + (e && e.to) + ' points at an id that is not in nodes.')
    if (ix[e.from] !== ix[e.to]) E.push({ a: ix[e.from], b: ix[e.to], w: sx.num(e.weight) ? e.weight : 1 })
  })
  var deg = nodes.map(function () { return 0 }), nb = nodes.map(function () { return {} })
  E.forEach(function (e) { deg[e.a]++; deg[e.b]++; nb[e.a][e.b] = 1; nb[e.b][e.a] = 1 })
  var wt = nodes.map(function (nd, i) { return sx.num(nd.size) && nd.size > 0 ? nd.size : deg[i] })
  var maxW = Math.max.apply(null, E.map(function (e) { return e.w }).concat(1))
  // groups: first appearance order; past 8 they fold into the last slot, named "Other"
  var gl = [], gi = nodes.map(function (nd) {
    if (nd.group == null) return -1
    var k = gl.indexOf(String(nd.group)); if (k < 0) { gl.push(String(nd.group)); k = gl.length - 1 }
    return Math.min(k, 7)
  })
  var gnames = gl.slice(0, 8); if (gl.length > 8) gnames[7] = 'Other'
  var label = function (i) { return String(nodes[i].label != null ? nodes[i].label : nodes[i].id) }

  // ---- physics: Obsidian's d3 forces (repel 10, link 1 at distance 250, collide 60), in graph units
  var P = nodes.map(function (_, i) {
    var r = 10 * Math.sqrt(0.5 + i), a = i * Math.PI * (3 - Math.sqrt(5))
    return { x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0, fx: null, fy: null }
  })
  var L = E.map(function (e) {
    var cs = deg[e.a], ct = deg[e.b]
    return { s: P[e.a], t: P[e.b], bias: cs / (cs + ct), k: 1 / Math.min(cs, ct) }
  })
  // centre pull weaker than Obsidian's 0.1, which crushes small graphs into crossed shapes; twice as strong
  // vertically on wide cards so the layout matches the card
  var cx = 0.02, cy = (sx.W || 640) < 420 ? 0.02 : 0.04
  var sim = { alpha: 1, target: 0 }, DECAY = 1 - Math.pow(0.001, 1 / 300)
  var tick = function () {
    var a = (sim.alpha += (sim.target - sim.alpha) * DECAY), i, j, p, q, dx, dy, d2, l
    for (i = 0; i < n; i++) { P[i].vx -= P[i].x * cx * a; P[i].vy -= P[i].y * cy * a }
    L.forEach(function (k) {
      var x = k.t.x + k.t.vx - k.s.x - k.s.vx, y = k.t.y + k.t.vy - k.s.y - k.s.vy
      var l0 = Math.hypot(x, y) || 1e-3, m = ((l0 - 250) / l0) * a * k.k
      x *= m; y *= m
      k.t.vx -= x * k.bias; k.t.vy -= y * k.bias; k.s.vx += x * (1 - k.bias); k.s.vy += y * (1 - k.bias)
    })
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      p = P[i]; q = P[j]; dx = q.x - p.x; dy = q.y - p.y
      if (!dx && !dy) { dx = (i - j) * 1e-3; dy = 1e-3 }
      d2 = dx * dx + dy * dy; if (d2 < 900) d2 = Math.sqrt(900 * d2)
      l = (-1000 * a) / d2
      p.vx += dx * l; p.vy += dy * l; q.vx -= dx * l; q.vy -= dy * l
    }
    for (i = 0; i < n; i++) {
      p = P[i]; var px = p.x + p.vx, py = p.y + p.vy
      for (j = i + 1; j < n; j++) {
        q = P[j]; dx = px - q.x - q.vx; dy = py - q.y - q.vy; d2 = dx * dx + dy * dy
        if (d2 >= 14400) continue
        if (!dx && !dy) { dx = 1e-3; d2 = 1e-6 }
        var d = Math.sqrt(d2); l = ((120 - d) / d) * 0.25
        p.vx += dx * l; p.vy += dy * l; q.vx -= dx * l; q.vy -= dy * l
      }
    }
    P.forEach(function (p) {
      if (p.fx != null) { p.x = p.fx; p.y = p.fy; p.vx = p.vy = 0 } else { p.vx *= 0.6; p.vy *= 0.6; p.x += p.vx; p.y += p.vy }
    })
  }
  // settle before the first frame from a few start orders and keep the one whose links cross least
  // (one spiral start can lock a cycle into a bowtie)
  var place = function (order) {
    order.forEach(function (i, k) {
      var r = 10 * Math.sqrt(0.5 + k), a = k * Math.PI * (3 - Math.sqrt(5))
      P[i].x = r * Math.cos(a); P[i].y = r * Math.sin(a); P[i].vx = P[i].vy = 0
    })
    sim.alpha = 1
    for (var t = 0; t < 300; t++) tick()
    var c = 0
    for (var u = 0; u < E.length; u++) for (var v = u + 1; v < E.length; v++) {
      var e = E[u], f = E[v]
      if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue
      var A = P[e.a], B = P[e.b], C2 = P[f.a], D = P[f.b]
      var o = function (p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) }
      if (o(A, B, C2) * o(A, B, D) < 0 && o(C2, D, A) * o(C2, D, B) < 0) c++
    }
    return c
  }
  var ids = nodes.map(function (_, i) { return i })
  var hub = ids.slice().sort(function (a, b) { return deg[b] - deg[a] })
  var bfs = [hub[0]], seen = {}; seen[hub[0]] = 1
  for (var h0 = 0; bfs.length < n; h0++) {
    if (h0 >= bfs.length) { var rest = ids.filter(function (i) { return !seen[i] }); bfs.push(rest[0]); seen[rest[0]] = 1 }
    Object.keys(nb[bfs[h0]]).forEach(function (k) { if (!seen[k]) { seen[k] = 1; bfs.push(+k) } })
  }
  var seed = 7, shuffle = function () { return ids.slice().sort(function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5 }) }
  var starts = n * E.length > 6000 ? [ids] : [ids, bfs, hub, ids.slice().reverse(), shuffle(), shuffle()]
  var best = null, bestC = Infinity
  starts.forEach(function (o) { var c = place(o); if (c < bestC) { bestC = c; best = o } })
  if (best !== starts[starts.length - 1]) place(best)
  sim.alpha = 0

  // ---- canvas at real pixels
  var W = sx.W || 640, H = spec.height || Math.min(460, Math.max(W < 420 ? 300 : 340, 120 + n * 14))
  var fig = sx.h('figure', 'sx-fig', host)
  var cv = sx.h('canvas', 'sx-net', fig)
  cv.setAttribute('role', 'img')
  cv.setAttribute('aria-label', (spec.title || 'Network') + ': ' + n + ' nodes, ' + E.length + ' links')
  cv.style.cssText = 'display:block;width:100%;height:' + H + 'px;touch-action:none'
  var dpr = Math.min(3, window.devicePixelRatio || 1)
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
  var ctx = cv.getContext('2d')
  var cs = getComputedStyle(host), tok = function (v) { return cs.getPropertyValue(v).trim() }
  var probe = function (v) { var s = sx.h('i', '', fig); s.style.color = v; var c = getComputedStyle(s).color; s.remove(); return c }
  var C = { line: tok('--line2'), lit: tok('--muted'), node: tok('--muted'), text: tok('--muted'), hot: tok('--fg'), ring: tok('--surface') }
  var fills = nodes.map(function (_, i) { return gi[i] < 0 ? C.node : probe(sx.color(gi[i])) })
  var font = '11.5px ' + getComputedStyle(cv).fontFamily
  // labels go best-linked first; one that would overlap a drawn label or node waits for hover
  var rank = deg.map(function (d, i) { return [d, i] }).sort(function (a, b) { return b[0] - a[0] }).map(function (x) { return x[1] })

  var view = { s: 1, x: W / 2, y: H / 2 }
  var fit = function () {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    P.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) })
    var s = Math.min(1, (W - 96) / Math.max(x1 - x0, 1), (H - 64) / Math.max(y1 - y0, 1))
    var g = 0.88 + 0.12 * (1 - Math.pow(1 - born, 3))
    s *= g
    view.s = s; view.x = W / 2 - ((x0 + x1) / 2) * s; view.y = H / 2 - ((y0 + y1) / 2) * s - 8
  }
  // node radius grows with sqrt(links) like Obsidian's, in screen px so hubs read at any zoom: 3.5 to 10 px
  var rad = function (i) { return Math.max(3.5, Math.min(10, 3 + 1.4 * Math.sqrt(wt[i]))) }
  var X = function (p) { return p.x * view.s + view.x }, Y = function (p) { return p.y * view.s + view.y }
  var hot = -1, fade = nodes.map(function () { return 0 }), lift = nodes.map(function () { return 0 }), born = sx.reduce ? 1 : 0
  var touched = false, raf = 0

  var frame = function () {
    raf = 0
    if (!cv.isConnected) return
    var busy = false
    if (sim.alpha > 0.002 || sim.target > 0) { tick(); busy = true }
    if (born < 1) { born = Math.min(1, born + 1 / 30); busy = true }
    if (!touched) fit()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = born
    var on = function (i) { return hot < 0 || i === hot || nb[hot][i] }
    nodes.forEach(function (_, i) {
      var to = on(i) ? 1 : 0.2
      fade[i] = fade[i] ? fade[i] * 0.8 + to * 0.2 : to
      lift[i] = lift[i] * 0.8 + (i === hot ? 4 : 0) * 0.2
      if (Math.abs(fade[i] - to) > 0.003 || Math.abs(lift[i] - (i === hot ? 4 : 0)) > 0.05) busy = true
    })
    // links: hairlines from node edge to node edge; a lit link takes the hovered node's ink
    E.forEach(function (e, k) {
      var s = P[e.a], t = P[e.b], dx = t.x - s.x, dy = t.y - s.y, m = Math.hypot(dx, dy) * view.s
      var rs = rad(e.a), rt = rad(e.b)
      if (m <= rs + rt + 2) return
      var lit = hot >= 0 && (e.a === hot || e.b === hot)
      var ux = (dx * view.s) / m, uy = (dy * view.s) / m
      ctx.globalAlpha = born * (lit ? 1 : Math.min(fade[e.a], fade[e.b]))
      ctx.strokeStyle = lit ? C.lit : C.line
      ctx.lineWidth = 1 + 1.5 * ((e.w - 1) / Math.max(1, maxW - 1))
      ctx.beginPath()
      ctx.moveTo(X(s) + ux * rs, Y(s) + uy * rs)
      var tx = X(t) - ux * (rt + 1), ty = Y(t) - uy * (rt + 1)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      if (spec.directed) {
        // Obsidian's arrow head: (0,0) (-4,-2) (-3,0) (-4,2), at 2x
        ctx.fillStyle = ctx.strokeStyle
        ctx.beginPath()
        ;[[0, 0], [-4, -2], [-3, 0], [-4, 2]].forEach(function (pt, z) {
          var px = tx + (pt[0] * ux - pt[1] * uy) * 2, py = ty + (pt[0] * uy + pt[1] * ux) * 2
          z ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
        })
        ctx.fill()
      }
    })
    // nodes, each with a 2px surface ring so overlaps stay apart
    nodes.forEach(function (_, i) {
      var r = rad(i) * (i === hot ? 1.25 : 1)
      ctx.globalAlpha = born * fade[i]
      ctx.beginPath(); ctx.arc(X(P[i]), Y(P[i]), r + 2, 0, Math.PI * 2); ctx.fillStyle = C.ring; ctx.fill()
      ctx.beginPath(); ctx.arc(X(P[i]), Y(P[i]), r, 0, Math.PI * 2)
      ctx.fillStyle = i === hot && gi[i] < 0 ? C.hot : fills[i]; ctx.fill()
    })
    // labels under the nodes, over everything
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    var boxes = P.map(function (p, i) { var r = rad(i); return [X(p) - r, Y(p) - r, X(p) + r, Y(p) + r, i] })
    // hovering: the hovered label first, then its neighbours', then the faded rest
    var order = hot < 0 ? rank : [hot].concat(rank.filter(function (i) { return nb[hot][i] }), rank.filter(function (i) { return i !== hot && !nb[hot][i] }))
    order.forEach(function (i) {
      var t = label(i), tw = ctx.measureText(t).width
      var tx = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, X(P[i]))), ty = Y(P[i]) + rad(i) + 4 + lift[i]
      var b = [tx - tw / 2 - 2, ty, tx + tw / 2 + 2, ty + 14]
      var clash = boxes.some(function (q) { return q[4] !== i && q[0] < b[2] && b[0] < q[2] && q[1] < b[3] && b[1] < q[3] })
      if (clash && i !== hot) return
      boxes.push(b.concat(-1))
      ctx.globalAlpha = born * fade[i]
      ctx.fillStyle = i === hot ? C.hot : C.text
      ctx.fillText(t, tx, ty)
    })
    ctx.globalAlpha = 1
    if (busy || drag) raf = requestAnimationFrame(frame)
  }
  var wake = function () { if (!raf) raf = requestAnimationFrame(frame) }

  var pos = function (e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  var hit = function (p) {
    var best = -1, bd = Infinity
    P.forEach(function (q, i) { var d = Math.hypot(X(q) - p.x, Y(q) - p.y); if (d <= Math.max(rad(i) + 4, 10) && d < bd) { best = i; bd = d } })
    return best
  }
  var drag = null
  cv.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return
    var p = pos(e), i = hit(p)
    if (i < 0) return
    cv.setPointerCapture(e.pointerId)
    drag = { i: i, sx: p.x, sy: p.y, moved: false }
  })
  cv.addEventListener('pointermove', function (e) {
    var p = pos(e)
    if (drag) {
      if (!drag.moved && (p.x - drag.sx) * (p.x - drag.sx) + (p.y - drag.sy) * (p.y - drag.sy) < 25) return
      drag.moved = true; touched = true
      var q = P[drag.i]; q.fx = (p.x - view.x) / view.s; q.fy = (p.y - view.y) / view.s
      sim.alpha = Math.max(sim.alpha, 0.3); sim.target = 0.3
      sx.tip(null); wake(); return
    }
    var i = hit(p)
    if (i !== hot) { hot = i; cv.style.cursor = i >= 0 ? 'grab' : ''; wake() }
    if (i >= 0) {
      var rows = [['Links', String(deg[i])]]
      if (gi[i] >= 0) rows.unshift(['Group', gnames[gi[i]], sx.color(gi[i])])
      sx.tip(sx.tipRows(label(i), rows), e.clientX, e.clientY)
    } else sx.tip(null)
  })
  var up = function () {
    if (!drag) return
    var q = P[drag.i]; q.fx = q.fy = null; sim.target = 0; drag = null; wake()
  }
  cv.addEventListener('pointerup', up)
  cv.addEventListener('pointercancel', up)
  cv.addEventListener('pointerleave', function () { if (!drag) { hot = -1; cv.style.cursor = ''; sx.tip(null); wake() } })
  if (gnames.length > 1) sx.legend(host, gnames)
  frame()
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
