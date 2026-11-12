// A particle entrance followed by a quiet rim glint. The texture is built once;
// ambient frames reuse it at 24fps, without regenerating grain or particles.
export function createFormation(canvas, config) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const source = document.createElement('canvas');
  const sourceCtx = source.getContext('2d', { alpha: false });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-formation')) || 2800;
  const ambientDuration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-ambient')) || 18000;
  const easing = new Float32Array(1025);
  // Exact shared ease-out curve (.23, 1, .32, 1), precomputed for all particles.
  for (let i = 0; i <= 1024; i++) {
    const x = i / 1024;
    let lo = 0, hi = 1;
    for (let n = 0; n < 16; n++) {
      const t = (lo + hi) / 2;
      const bx = 3 * (1 - t) ** 2 * t * .23 + 3 * (1 - t) * t * t * .32 + t ** 3;
      if (bx < x) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2;
    easing[i] = 1 - (1 - t) ** 3;
  }
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => easing[Math.round(clamp(x) * 1024)];
  let width = 0, height = 0, fieldHeight = 0;
  let particles = [], initialized = false, active = false, ambient = false, disposed = false;
  let frame = 0, elapsed = 0, lastTime = 0;
  let ambientElapsed = 0, lastAmbientPaint = 0;
  const canRun = () => !disposed && !reduce.matches && !document.hidden && canvas.dataset.motion !== 'paused';

  function settle() {
    cancelAnimationFrame(frame); frame = 0; active = false; lastTime = 0;
    if (!width) return;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(source, 0, 0);
    canvas.dataset.formation = 'settled';
    ambient = !reduce.matches;
    if (ambient && canRun()) frame = requestAnimationFrame(tick);
  }
  function paintGlint(position, envelope) {
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 2; band++) {
      ctx.strokeStyle = band ? '#b7c9f5' : '#6c88d2';
      ctx.lineWidth = band ? 1 : 7;
      let previous = null;
      for (let i = 0; i <= 36; i++) {
        const u = position - .08 + i / 36 * .16;
        const dx = (u - config.center[0]) / config.radius[0];
        if (u < 0 || u > 1 || Math.abs(dx) >= 1) { previous = null; continue; }
        const point = [u * width, (config.center[1] - config.radius[1] * Math.sqrt(1 - dx * dx)) * fieldHeight];
        if (previous) {
          ctx.globalAlpha = envelope * Math.sin(i / 36 * Math.PI) ** 2 * (band ? .7 : .16);
          ctx.beginPath(); ctx.moveTo(...previous); ctx.lineTo(...point); ctx.stroke();
        }
        previous = point;
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function paintAmbient() {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(source, 0, 0);
    const phase = (ambientElapsed % ambientDuration) / ambientDuration;
    paintGlint(-.08 + phase * 1.16, Math.sin(phase * Math.PI) ** 2 * .10);
  }
  function paint(time) {
    const progress = clamp(time / duration);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0a0c11'; ctx.fillRect(0, 0, width, height);
    // The atmosphere gradually materializes behind the converging pixels.
    const reveal = ease((progress - .26) / .62);
    ctx.globalAlpha = reveal;
    ctx.drawImage(source, 0, 0);
    const dissolve = 1 - clamp((progress - .58) / .25);
    if (dissolve > 0) {
      for (const p of particles) {
        const local = clamp((progress - p.delay) / .54);
        if (local === 0) continue;
        const settled = ease(local);
        const bend = Math.sin(settled * Math.PI) * (1 - settled);
        const x = p.x + (p.sx - p.x) * (1 - settled) + p.curl * bend;
        const y = p.y + (p.sy - p.y) * (1 - settled) - Math.abs(p.curl) * bend;
        ctx.globalAlpha = Math.min(1, local * 10) * dissolve * p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size, p.size);
      }
    }
    // A single glint follows the actual elliptical limb, then disappears.
    const sweep = (progress - .44) / .50;
    if (sweep > 0 && sweep < 1) {
      paintGlint(-.08 + sweep * 1.16, Math.sin(sweep * Math.PI) * .40);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function tick(now) {
    if ((!active && !ambient) || disposed) return;
    const delta = lastTime ? Math.max(0, now - lastTime) : 0;
    lastTime = now;
    if (active) {
      elapsed += delta;
      if (elapsed >= duration) { settle(); return; }
      paint(elapsed);
    } else {
      ambientElapsed += delta;
      if (now - lastAmbientPaint >= 1000 / 24) { paintAmbient(); lastAmbientPaint = now; }
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    if (!width || disposed) return;
    if (reduce.matches) { settle(); return; }
    if (!active && canvas.dataset.formation === 'settled') ambient = true;
    if ((active || ambient) && canRun()) frame = requestAnimationFrame(tick);
  }
  function replay() {
    if (!width || disposed) return;
    if (reduce.matches) { settle(); return; }
    elapsed = 0; ambientElapsed = 0; active = true; ambient = false; canvas.dataset.motion = 'running';
    canvas.dataset.formation = 'forming';
    paint(0); sync();
  }
  function setTexture(image, dimensions) {
    width = image.width; height = image.height; fieldHeight = dimensions.fieldHeight;
    source.width = width; source.height = height; sourceCtx.putImageData(image, 0, 0);
    particles = [];
    let seed = config.seed + 71;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    const budget = Math.min(5400, Math.floor(width * height / 60));
    for (let attempt = 0; attempt < budget * 12 && particles.length < budget; attempt++) {
      const x = Math.floor(random() * width), y = Math.floor(random() * height);
      const i = (y * width + x) * 4;
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      if (r + g + b < 95) continue;
      particles.push({ x, y, sx: x + (random() - .5) * width * 1.1,
        sy: y - (.12 + random() * .55) * fieldHeight,
        curl: (random() - .5) * width * .18,
        delay: random() * .27 + Math.abs(x / width - .5) * .20,
        alpha: .55 + random() * .45, size: random() > .94 ? 2 : 1,
        color: `rgb(${Math.min(180, r * 1.5)},${Math.min(195, g * 1.5)},${Math.min(220, b * 1.5)})`,
      });
    }
    if (!initialized) { initialized = true; replay(); }
    else settle(); // Resizing settles the background instead of restarting it.
  }
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('replay-formation', replay);
  canvas.addEventListener('motion-change', sync);
  reduce.addEventListener('change', sync);
  return { setTexture, dispose() {
    disposed = true; cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('replay-formation', replay);
    canvas.removeEventListener('motion-change', sync);
    reduce.removeEventListener('change', sync);
    delete canvas.dataset.formation;
  } };
}
