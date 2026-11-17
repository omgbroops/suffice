// Voice orb: a soft cloudy disc (a clear upper field, a haze band that wanders, a pale
// base) drawn in fine ordered-dither cells, the same cell language as the wallpaper's
// Dither effect. The clouds drift; the cells and the disc's size never move.
// Colours come from a three-tone palette, by default sampled from the wallpaper in use.
const FPS = 30, CELL = 3, SMALL_CELL = 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TOP = [86, 124, 224], BASE = [190, 198, 240], CLOUD = [247, 248, 254];

// Drift speed and cloud cover per state. Nothing else changes between states.
const MOTION = {
  idle: [0.5, 0], connecting: [0.8, 0], listening: [0.7, 0], hearing: [1.2, 0.04], heard: [1.2, 0.04], thinking: [0.45, -0.03],
  working: [0.6, -0.02], speaking: [1.5, 0.06], interrupted: [0.4, 0], muted: [0, -0.02], error: [0, -0.04], ended: [0, 0],
};
const LIVE = new Set(['hearing', 'heard', 'speaking']);

const smooth = t => t * t * (3 - 2 * t);
const step = (a, b, x) => smooth(Math.max(0, Math.min(1, (x - a) / (b - a))));
function hash(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2.03 + 17, y * 2.03 + 9) * 0.27 + noise(x * 4.1 + 31, y * 4.1 + 5) * 0.15 + noise(x * 8.2 + 3, y * 8.2 + 41) * 0.08;

export function createOrb(canvas, { palette } = {}) {
  const context = canvas.getContext('2d');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
  // Three tones: the upper field, the lower field and the haze between them.
  let tones = { top: TOP, base: BASE, cloud: CLOUD, ...palette };
  let grid = 0, image, state = 'idle', level = 0, target = 0, frame = 0, last = 0, clock = 0, previous = null, destroyed = false;

  // One cell is 3 CSS px (2 on small orbs), so the pattern matches the wallpaper at any size.
  function fit() {
    const size = canvas.clientWidth || 144;
    const next = Math.max(6, Math.min(120, Math.round(size / (size < 40 ? SMALL_CELL : CELL))));
    if (next !== grid) { grid = next; canvas.width = canvas.height = grid; image = context.createImageData(grid, grid); }
  }

  function draw(t) {
    fit();
    const [, cover] = MOTION[state] || MOTION.idle;
    const data = image.data, half = grid / 2;
    // The haze band tilts slowly back and forth.
    const tilt = -0.2 + 0.3 * Math.sin(t * 0.13), cos = Math.cos(tilt), sin = Math.sin(tilt);
    const lift = cover + (LIVE.has(state) ? level * 0.05 : 0);
    for (let py = 0; py < grid; py++) for (let px = 0; px < grid; px++) {
      const x = (px + 0.5 - half) / half, y = (py + 0.5 - half) / half, r = Math.hypot(x, y), i = (py * grid + px) * 4;
      if (r > 1.02) { data[i + 3] = 0; continue; }
      const v = y * cos - x * sin, u = x * cos + y * sin;
      const ground = step(-1, 0.9, v);
      // The haze has a soft upper edge that wanders, is brightest just under it, and thins toward the base.
      const edge = -0.05 - lift * 2 + (fbm(u * 0.9 + t * 0.06, 3 + t * 0.045) - 0.5) * 0.9 + (fbm(u * 2.2 - t * 0.04, 7 + t * 0.03) - 0.5) * 0.1;
      const soft = 0.18 + fbm(u * 1.3 + 5, v * 1.3 + t * 0.05) * 0.3;
      const above = step(edge - soft, edge + 0.05, v);
      const below = Math.exp(-Math.max(0, v - edge - 0.12) / 0.5);
      const billow = 0.9 + (fbm(u * 1.6 + t * 0.05, v * 1.6 - t * 0.03) - 0.5) * 0.35;
      const cloud = above * Math.min(1, 0.08 + 0.92 * below * billow);
      // Ordered dither: the same Bayer matrix as the wallpaper, eight levels per channel.
      const dither = (BAYER[(py % 4) * 4 + px % 4] / 16 - 0.5) * 30;
      for (let c = 0; c < 3; c++) {
        const sky = tones.top[c] + (tones.base[c] - tones.top[c]) * ground;
        data[i + c] = Math.max(0, Math.min(255, Math.round((sky + (tones.cloud[c] - sky) * cloud + dither) / 32) * 32));
      }
      data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function tick(now) {
    frame = 0;
    if (destroyed) return;
    const [speed] = MOTION[state] || MOTION.idle;
    if (document.hidden || !canvas.isConnected || reduced() || speed === 0) { previous = null; draw(clock); return; }
    if (previous !== null) clock += Math.min(0.1, (now - previous) / 1000) * speed * (1 + (LIVE.has(state) ? level * 1.5 : 0));
    previous = now;
    if (now - last >= 1000 / FPS) { level += (target - level) * 0.2; draw(clock); last = now; }
    frame = requestAnimationFrame(tick);
  }
  function wake() { if (!frame && !destroyed) frame = requestAnimationFrame(tick); }
  const onVisibility = () => wake();
  document.addEventListener('visibilitychange', onVisibility);
  draw(0); wake();

  return {
    setState(next) { if (next !== state) { state = next; wake(); } },
    setLevel(value) { target = Math.max(0, Math.min(1, Number(value) || 0)); },
    setPalette(next) { tones = { top: TOP, base: BASE, cloud: CLOUD, ...next }; draw(clock); },
    // Deterministic frame for tests and captures.
    frame(t, fixedLevel = level) { level = target = fixedLevel; draw(t); },
    get state() { return state; },
    destroy() { destroyed = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); },
  };
}
