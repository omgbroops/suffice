// Procedural fluted-glass relief inspired by the supplied reference. The broad
// peach/rose/lavender fields are darkened before fine, seeded pixel dithering.
import { observeBackgroundResize } from './resize.js';
export function mountRidges(canvas, config) {
  const host = canvas.parentElement;
  const ctx = canvas.getContext('2d', { alpha: false });
  const bell = (d, spread) => Math.exp(-(d * d) / (2 * spread * spread));
  const glow = (x, y, cx, cy, sx, sy) => bell(x - cx, sx) * bell(y - cy, sy);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let frame;
  function draw() {
    const pitch = config.pixelPitch;
    const width = Math.ceil(host.clientWidth / pitch);
    const height = Math.ceil(host.clientHeight / pitch);
    const fieldHeight = Math.max(800, Math.min(host.clientHeight, 1050)) / pitch;
    const ridgeWidth = host.clientWidth < 700 ? 20 : config.ridgeWidth;
    canvas.width = width; canvas.height = height;
    const image = ctx.createImageData(width, height);
    const { base, peach, rose, lavender, plum } = config.palette;
    let seed = config.seed;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    for (let x = 0; x < width; x++) {
      const phase = ((x * pitch) % ridgeWidth) / ridgeWidth;
      // Each flute bends the field slightly and has a lit lip and shaded edge.
      const u = (x * pitch + (phase - .5) * ridgeWidth * 1.1) / host.clientWidth;
      const face = .59 + .41 * Math.pow(1 - phase, .75);
      const lip = bell(phase - .09, .055) * .13;
      const edge = bell(phase - .96, .04) * .12;
      const relief = face + lip - edge;
      for (let y = 0; y < height; y++) {
        const v = y / fieldHeight;
        const warm = glow(u, v, .22, .05, .38, .43);
        const pink = glow(u, v, .12, .92, .38, .39);
        const cool = glow(u, v, .73, 1.01, .24, .36);
        const violet = glow(u, v, .58, .56, .30, .39);
        const pattern = bayer[(y % 4) * 4 + x % 4] / 16 + (random() - .5) * .22;
        const dither = pattern < .24 ? .33 : pattern < .46 ? .68 : 1;
        const grain = (random() - .5) * config.grain;
        const vignette = .75 + .25 * glow(u, v, .47, .43, .65, .65);
        const tail = Math.exp(-Math.max(0, v - .94) * 3.5);
        const i = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const color = warm * peach[channel] + pink * rose[channel] + cool * lavender[channel] + violet * plum[channel];
          image.data[i + channel] = (base[channel] + color * relief * dither * config.exposure * vignette + grain) * tail;
        }
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const observer = observeBackgroundResize(host, () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
  draw();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
