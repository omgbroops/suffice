// Projected rows of code-like glyphs trace a quiet, rolling ASCII landscape.
export function mountAscii(canvas, config) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let frame, disposed = false;
  function draw() {
    if (disposed) return;
    const width = Math.ceil(canvas.clientWidth);
    const height = Math.ceil(canvas.clientHeight);
    const fieldHeight = Math.max(800, Math.min(height, 1050));
    canvas.width = width; canvas.height = height;
    const wash = ctx.createRadialGradient(width * .51, fieldHeight * .58, 0, width * .51, fieldHeight * .58, width * .73);
    wash.addColorStop(0, '#111820'); wash.addColorStop(1, '#0b0d11');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const columns = Math.ceil(width / 8), rows = 68;
    const ramp = '.:;-=+*#';
    for (let row = 0; row < rows; row++) {
      const depth = row / (rows - 1);
      const perspective = .72 + depth * .70;
      const size = 8 + depth * 5;
      ctx.font = `${size}px "Geist Pixel", monospace`;
      for (let col = 0; col <= columns; col++) {
        const worldX = (col / columns - .5) * 2.4;
        const wave = Math.sin(worldX * 2.5 + depth * 4) * .55 + Math.sin(worldX * 4.1 - depth * 5) * .19;
        const slope = Math.cos(worldX * 2.5 + depth * 4) * 1.375 + Math.cos(worldX * 4.1 - depth * 5) * .779;
        const x = width * .52 + worldX * width * .46 * perspective;
        const y = fieldHeight * (.27 + depth * .88 - wave * (.06 + .08 * depth));
        if (x < -10 || x > width + 10 || y > height + 10) continue;
        const contour = Math.pow(.5 + .5 * Math.sin(depth * 38 + wave * 3), 8);
        const light = Math.max(0, Math.min(1, .48 + wave * .38 - slope * .08));
        const shade = .18 + light * .40 + contour * .32;
        const fade = (.5 + .5 * Math.sin((depth + .1) * Math.PI / 2)) * Math.exp(-Math.max(0, y / fieldHeight - .85) * 3);
        const luminosity = shade * fade * config.exposure;
        const glyph = contour > .60 && Math.abs(slope) > .7 ? slope > 0 ? '/' : '\\' : ramp[Math.min(ramp.length - 1, Math.floor(shade * ramp.length))];
        ctx.fillStyle = `rgb(${Math.round(24 + luminosity * 69)},${Math.round(28 + luminosity * 77)},${Math.round(34 + luminosity * 92)})`;
        ctx.fillText(glyph, Math.round(x), Math.round(y));
      }
    }
  }
  const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
  observer.observe(canvas); draw();
  document.fonts.load('12px "Geist Pixel"').then(draw);
  return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); };
}
