// Neon dither: an original seeded scene (dark shards, magenta rim light, teal mist)
// rendered as hard on/off cells with a 4x4 Bayer threshold, like a screen-door LCD.
// One canvas pixel = one cell; CSS scales it with image-rendering: pixelated.
import { observeBackgroundResize } from './resize.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const OFF = [6, 6, 7];          // unlit cell
const FLOOR = [46, 43, 54];     // dimmest lit cell, keeps the dark field textured

export function mountNeonDither(canvas, config) {
  const host = canvas.parentElement, ctx = canvas.getContext('2d', { alpha: false });
  const src = document.createElement('canvas'), s = src.getContext('2d', { willReadFrequently: true });
  let resizeFrame = 0;

  const rng = (() => { let a = config.seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
  const hash = (x, y) => { let v = Math.imul(x + config.seed, 374761393) ^ Math.imul(y + 977, 668265263); v = Math.imul(v ^ v >>> 13, 1274126177); return ((v ^ v >>> 16) >>> 0) / 4294967296; };
  const smooth = t => t * t * (3 - 2 * t);
  const vnoise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1, y * 2.1) * .3 + vnoise(x * 4.3, y * 4.3) * .2;
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  function paint(W, H) {
    const R = rng(), P = (u, v) => [u * W, v * H];
    const poly = (pts, fill, edge, edgeW = 1) => {
      s.beginPath(); pts.forEach(([u, v], i) => s[i ? 'lineTo' : 'moveTo'](...P(u, v))); s.closePath();
      if (fill) { s.fillStyle = rgb(fill); s.fill(); }
      if (edge) { s.strokeStyle = rgb(edge); s.lineWidth = edgeW; s.stroke(); }
    };
    const g = s.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#221f2b'); g.addColorStop(.55, '#2a2433'); g.addColorStop(1, '#241f2c');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
    const t = s.createLinearGradient(W * .74, 0, W, 0);
    t.addColorStop(0, 'rgba(30,110,120,0)'); t.addColorStop(.45, 'rgba(34,128,138,.75)'); t.addColorStop(1, 'rgba(44,150,158,.95)');
    s.fillStyle = t; s.fillRect(0, 0, W, H);
    poly([[.27, -.02], [.37, -.02], [.40, .55], [.43, .96], [.31, .98], [.29, .50]], [24, 21, 30], [84, 44, 70], 2);
    const shards = [
      [[.47, .06], [.62, .02], [.66, .30], [.55, .44], [.46, .30]],
      [[.58, .30], [.74, .18], [.80, .40], [.70, .58], [.60, .52]],
      [[.50, .46], [.62, .52], [.66, .80], [.54, .86], [.47, .70]],
      [[.68, .58], [.79, .46], [.86, .70], [.78, .92], [.69, .84]],
      [[.40, .10], [.47, .06], [.46, .30], [.42, .36]],
    ];
    shards.forEach((pts, i) => poly(pts, [38 + i * 3, 30 + i * 2, 50 + i * 4], [150, 48, 160], 1.4));
    s.globalAlpha = .55; shards.forEach(pts => { const [a, , c] = pts; s.beginPath(); s.moveTo(...P(...a)); s.lineTo(...P(...c)); s.strokeStyle = '#6c2a8a'; s.lineWidth = 1; s.stroke(); }); s.globalAlpha = 1;
    const [ex, ey] = P(.71, .30), er = Math.max(3, H * .045);
    const eg = s.createRadialGradient(ex, ey, 0, ex, ey, er * 2.4);
    eg.addColorStop(0, '#e070e0'); eg.addColorStop(.35, '#a83ca8'); eg.addColorStop(1, 'rgba(110,40,140,0)');
    s.fillStyle = eg; s.beginPath(); s.arc(ex, ey, er * 2.4, 0, Math.PI * 2); s.fill();
    for (let k = 0; k < 4; k++) {
      s.beginPath(); const base = .62 + k * .09;
      for (let i = 0; i <= 40; i++) { const u = i / 40 * .62, v = base + .10 * Math.sin(u * 5 + k) - u * .18; s[i ? 'lineTo' : 'moveTo'](...P(u, v)); }
      s.lineTo(...P(.62, 1.05)); s.lineTo(...P(0, 1.05)); s.closePath();
      s.fillStyle = rgb([[70, 60, 112], [86, 70, 128], [62, 56, 104], [96, 76, 136]][k]); s.globalAlpha = .55; s.fill(); s.globalAlpha = 1;
    }
    for (let i = 0; i < W * H * .0016; i++) {
      const u = R() * .72, v = R(), c = R() < .6 ? [176, 64, 184] : [72, 84, 170];
      s.fillStyle = rgb(c); s.fillRect(Math.floor(u * W), Math.floor(v * H), 1 + (R() < .3), 1);
    }
    s.strokeStyle = '#b040b8'; s.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      s.beginPath(); const y0 = R() * .35 + .05, x0 = R() * .25;
      for (let i = 0; i < 12; i++) { const u = x0 + i * .018, v = y0 + i * .012 + (R() - .5) * .01; s[i ? 'lineTo' : 'moveTo'](...P(u, v)); }
      s.stroke();
    }
  }

  // Gradient maps: warm pixels go to the magenta ramp, cool ones to the teal ramp (stops at 0, .35, .6, .85, 1).
  const MAG = [[30, 26, 38], [70, 44, 82], [118, 42, 148], [176, 64, 184], [232, 150, 232]];
  const TEAL = [[28, 32, 40], [30, 76, 92], [36, 126, 138], [62, 168, 174], [160, 224, 224]];
  const STOPS = [0, .35, .6, .85, 1];
  const ramp = (R, t) => { let k = 0; while (k < 3 && t > STOPS[k + 1]) k++; const f = (t - STOPS[k]) / (STOPS[k + 1] - STOPS[k]);
    return [0, 1, 2].map(c => R[k][c] + (R[k + 1][c] - R[k][c]) * Math.min(1, Math.max(0, f))); };
  let art = null;
  function paintImage(W, H) {
    const sc = Math.max(W / art.width, H / art.height), w = art.width * sc, h = art.height * sc;
    s.imageSmoothingEnabled = true; s.drawImage(art, (W - w) * (config.focusX ?? .5), (H - h) * (config.focusY ?? .5), w, h);
    if (config.grade === false) {  // art already painted in the palette: keep its colors, lift exposure only
      const img = s.getImageData(0, 0, W, H), d = img.data, k = config.exposure ?? 1, g = config.gamma ?? 1;
      for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, 255 * Math.pow(d[i + c] / 255, g) * k);
      if (config.tealRight) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {  // teal mist over the right side, like the reference
        const t = Math.min(1, Math.max(0, (x / W - (1 - config.tealRight)) / config.tealRight)) * (.55 + .45 * fbm(x * .03, y * .03)), i = (y * W + x) * 4;
        d[i] += (40 - d[i]) * t; d[i + 1] += (150 - d[i + 1]) * t; d[i + 2] += (160 - d[i + 2]) * t;
      }
      s.putImageData(img, 0, 0); return;
    }
    const img = s.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const t = Math.pow((.299 * r + .587 * g + .114 * b) / 255, config.gamma ?? 1.1) * (config.exposure ?? 1);
      const warm = Math.min(1, Math.max(0, (r - b) / 255 * 2.2 + .5));
      const m = ramp(MAG, Math.min(1, t)), q = ramp(TEAL, Math.min(1, t));
      for (let c = 0; c < 3; c++) d[i + c] = q[c] + (m[c] - q[c]) * warm;
    }
    s.putImageData(img, 0, 0);
  }

  function build() {
    const W = Math.max(1, Math.ceil(host.clientWidth / config.cell)), H = Math.max(1, Math.ceil(host.clientHeight / config.cell));
    src.width = canvas.width = W; src.height = canvas.height = H;
    if (config.image && !art) return;
    if (art) paintImage(W, H); else paint(W, H);
    const img = s.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (fbm(x * .06, y * .06) - .5) * 26;             // grain so flat fills read as material
      let r = d[i] + n, g = d[i + 1] + n, b = d[i + 2] + n;
      const L = (.299 * r + .587 * g + .114 * b) / 255;
      const density = .5 + (L - .17) * config.contrast;          // field = checkerboard, highlights solid
      const lit = density > (BAYER[(x & 3) + ((y & 3) << 2)] + .5) / 16;
      if (lit) { d[i] = Math.max(r, FLOOR[0]); d[i + 1] = Math.max(g, FLOOR[1]); d[i + 2] = Math.max(b, FLOOR[2]); }
      else { d[i] = OFF[0]; d[i + 1] = OFF[1]; d[i + 2] = OFF[2]; }
    }
    ctx.putImageData(img, 0, 0);
  }

  if (config.image) { const im = new Image(); im.onload = () => { art = im; build(); }; im.src = config.image; }
  build();
  const observer = observeBackgroundResize(host, () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(build); });
  return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); };
}
