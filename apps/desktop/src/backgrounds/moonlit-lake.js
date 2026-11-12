// Original seeded scenery. Sky/water and land are cached separately; motion
// resamples those pixels instead of generating new noise on every frame.
import './moonlit-lake.css';
import { observeBackgroundResize } from './resize.js';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const PALETTE = [
  [8, 12, 17], [14, 20, 28], [22, 31, 43], [32, 44, 58],
  [47, 61, 75], [66, 80, 91], [90, 102, 108], [121, 128, 124],
  [155, 153, 136], [191, 179, 151],
];
const smooth = x => x * x * (3 - 2 * x);
const mix = (a, b, t) => a + (b - a) * t;
const bell = (x, width) => Math.exp(-x * x / (2 * width * width));

export function mountMoonlitLake(canvas, config) {
  const host = canvas.parentElement, ctx = canvas.getContext('2d', { alpha: false });
  const source = document.createElement('canvas'), sourceCtx = source.getContext('2d');
  const terrain = document.createElement('canvas'), terrainCtx = terrain.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, resizeFrame = 0, elapsed = 0, previous = null, lastPaint = 0, visible = true;
  let waterStart = 0, disposed = false;
  const canRun = () => !disposed && visible && !document.hidden && !reduce.matches && canvas.dataset.motion !== 'paused';
  const hash = (x, y = 0) => {
    let value = Math.imul(x + config.seed, 374761393) ^ Math.imul(y + 193, 668265263);
    value = Math.imul(value ^ value >>> 13, 1274126177);
    return ((value ^ value >>> 16) >>> 0) / 4294967296;
  };
  function noise(x, y = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), sx = smooth(x - ix), sy = smooth(y - iy);
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), sx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
  }
  const fbm = (x, y = 0) => noise(x, y) * .58 + noise(x * 2.03 + 11, y * 2.03 + 8) * .28 + noise(x * 4.07 + 23, y * 4.07 + 13) * .14;

  function build() {
    if (disposed) return;
    const width = Math.max(1, Math.ceil(host.clientWidth / config.pixelPitch));
    const height = Math.max(1, Math.ceil(host.clientHeight / config.pixelPitch));
    const fieldHeight = Math.min(host.clientHeight, 1100) / config.pixelPitch;
    const aspect = Math.min(1.65, Math.max(.8, host.clientWidth / Math.min(host.clientHeight, 1100)));
    canvas.width = width; canvas.height = height;
    source.width = terrain.width = width; source.height = terrain.height = height;
    const image = ctx.createImageData(width, height), land = ctx.createImageData(width, height);
    const moonX = .83, moonY = .145, waterline = .555;
    waterStart = Math.min(height, Math.ceil(waterline * fieldHeight));
    // Precompute silhouette heights; the shore stays coherent when resized.
    const hills = Array.from({ length: width }, (_, x) => {
      const u = x / width;
      return [
        .505 - .08 * fbm(u * 4 + 9) - .06 * bell(u - .16, .16),
        .54 - .055 * fbm(u * 8 + 21) - .12 * bell(u - .97, .13),
      ];
    });
    for (let y = 0; y < height; y++) {
      const v = y / fieldHeight;
      for (let x = 0; x < width; x++) {
        const u = x / width, dx = (u - moonX) * aspect, dy = v - moonY;
        const moonDistance = Math.hypot(dx, dy);
        let light, surfaceLight, isLand = false;
        if (v < waterline) {
          const sky = fbm(u * 4.2, v * 7 + 6);
          light = 1.45 + v * 2.7 + bell(moonDistance, .14) * 2.1;
          // Wide, irregular cloud banks, with one passing in front of the moon.
          const cloud = Math.max(0, sky - .40) * 5.2;
          const bank = bell(v - (.16 + .06 * Math.sin(u * 5.2)), .075) + bell(v - (.34 + .025 * Math.sin(u * 9)), .035);
          light -= cloud * bank * 2.8;
          light += Math.max(0, sky - .60) * bank * 1.2;
          if (moonDistance < .029) light = 8.3 - cloud * bell(v - .305, .022) * 3.4;
          surfaceLight = light;
          if (v > hills[x][0]) { light = 2.45 + noise(u * 40) * .35; isLand = true; }
          if (v > hills[x][1]) { light = 1.05 + noise(u * 65 + 7) * .5; isLand = true; }
          // A low pine island at the right shoreline, kept below the sky.
          const treeCell = u * 110, local = Math.abs(treeCell - Math.floor(treeCell) - .5);
          const treeTop = waterline - .017 - hash(Math.floor(treeCell), 81) * .038;
          if (u > .78 && u < .96 && v > treeTop + local * .08 && v < waterline) { light = .55; isLand = true; }
        } else {
          const water = v - waterline;
          const ripples = fbm(u * 7, v * 145 + 4);
          const streaks = Math.sin(v * 290 + noise(u * 13, v * 9) * 7);
          const reflectionWidth = .028 + water * .38;
          const reflection = bell(u - moonX + (noise(v * 48) - .5) * .025, reflectionWidth);
          const broken = .2 + .8 * smooth(Math.max(0, Math.min(1, (ripples - .27) * 2.3)));
          light = 1.5 + ripples * 1.8 + streaks * .23 + reflection * broken * (5.5 - Math.min(water, .8));
          light += bell(v - waterline, .01) * .45;
          surfaceLight = light;
          // Dark foreground rock shelves frame the water without boxing it in.
          const leftShore = .85 + Math.sqrt(u) * .65 + (fbm(u * 13, v * 12) - .5) * .12;
          const rightShore = .88 + Math.sqrt(1 - u) * .8 + (fbm(u * 13 + 8, v * 12) - .5) * .12;
          if (v > leftShore || v > rightShore) { light = .7 + fbm(u * 14, v * 8) * .8; isLand = true; }
          const fade = 1 - Math.min(.38, Math.max(0, v - 1) * .3);
          light *= fade; surfaceLight *= fade;
        }
        // Restrained side vignette and a locked seed avoid a TV-noise effect.
        const vignette = Math.pow(Math.abs(u - .5) * 2, 3) * .35;
        const threshold = BAYER[(y % 4) * 4 + x % 4] / 16 * .72 + hash(x + 73, y + 91) * .28;
        const quantize = value => {
          const level = Math.max(0, Math.min(PALETTE.length - 1, (value - vignette) * config.exposure));
          const low = Math.floor(level);
          return PALETTE[Math.min(PALETTE.length - 1, low + (level - low > threshold ? 1 : 0))];
        };
        const color = quantize(surfaceLight);
        const index = (y * width + x) * 4;
        image.data[index] = color[0]; image.data[index + 1] = color[1]; image.data[index + 2] = color[2]; image.data[index + 3] = 255;
        if (isLand) {
          const fixedColor = quantize(light);
          land.data[index] = fixedColor[0]; land.data[index + 1] = fixedColor[1]; land.data[index + 2] = fixedColor[2]; land.data[index + 3] = 255;
        }
      }
    }
    sourceCtx.putImageData(image, 0, 0); terrainCtx.putImageData(land, 0, 0);
    paint();
  }
  function paint() {
    const width = canvas.width, height = canvas.height;
    if (!width || !height) return;
    const time = reduce.matches ? 0 : elapsed;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    // Cloud banks and moon drift together very slowly above the fixed ridges.
    const drift = Math.round(Math.sin(time / 65) * width * .028);
    if (drift) {
      ctx.drawImage(source, 0, 0, width, waterStart, drift, 0, width, waterStart);
      ctx.drawImage(source, 0, 0, width, waterStart, drift - Math.sign(drift) * width, 0, width, waterStart);
    }
    // Each water row moves by at most a couple of source pixels. The cached
    // texture stays locked; alternating bands gently shear the reflection.
    for (let row = waterStart; row < height; row++) {
      const depth = (row - waterStart) / Math.max(1, height - waterStart);
      const shift = Math.round((Math.sin(row * .17 + time * .6) - Math.sin(row * .17)) * (.35 + depth * 1.1)
        + (Math.sin(row * .051 - time * .31) - Math.sin(row * .051)) * .6);
      if (!shift) continue;
      ctx.drawImage(source, 0, row, width, 1, shift, row, width, 1);
      ctx.drawImage(source, 0, row, width, 1, shift - Math.sign(shift) * width, row, width, 1);
    }
    ctx.drawImage(terrain, 0, 0);
  }
  function tick(now) {
    if (!canRun()) { frame = 0; previous = null; return; }
    if (previous !== null) elapsed += Math.min(.1, Math.max(0, now - previous) / 1000);
    previous = now;
    if (now - lastPaint >= 1000 / 24) { paint(); lastPaint = now; }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (disposed) return;
    cancelAnimationFrame(frame); frame = 0; previous = null;
    paint();
    if (canRun()) frame = requestAnimationFrame(tick);
  }
  const observer = observeBackgroundResize(host, () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(build); });
  const intersection = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; sync(); });
  intersection.observe(host); build(); sync();
  document.addEventListener('visibilitychange', sync); canvas.addEventListener('motion-change', sync); reduce.addEventListener('change', sync);
  return () => {
    disposed = true;
    observer.disconnect(); intersection.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame);
    document.removeEventListener('visibilitychange', sync); canvas.removeEventListener('motion-change', sync); reduce.removeEventListener('change', sync);
  };
}
