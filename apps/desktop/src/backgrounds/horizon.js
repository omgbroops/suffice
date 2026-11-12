// Original dithered horizon: blue atmosphere above a thin, warm curved edge.
// Static seeded pixels keep the gradient tactile without animated visual noise.
import { observeBackgroundResize } from './resize.js';
export function mountAtmosphere(canvas, palette = null) {
  const host = canvas.parentElement;
  const context = canvas.getContext('2d', { alpha: false });
  const bell = (n, spread) => Math.exp(-(n * n) / (2 * spread * spread));
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let frame;
  function draw() {
    const pitch = 1.5;
    const width = Math.ceil(host.clientWidth / pitch);
    const height = Math.ceil(host.clientHeight / pitch);
    const fieldHeight = Math.max(800, Math.min(host.clientHeight, 1050)) / pitch;
    canvas.width = width; canvas.height = height;
    const pixels = context.createImageData(width, height);
    let seed = 54893;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    for (let y = 0; y < height; y++) {
      const v = y / fieldHeight;
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const horizon = .25 + .43 * u + .055 * Math.sin(u * 3.8);
        const d = v - horizon;
        const blue = bell(d + .115, .115);
        const cyan = bell(d + .035, .046);
        const rim = bell(d, .012);
        const amber = bell(d - .022, .018);
        const daylight = .72 + .28 * bell(u - .5, .35);
        const threshold = bayer[(y % 4) * 4 + x % 4] / 16;
        const noise = random();
        const stipple = threshold + (noise - .5) * .26;
        const dither = stipple < .25 ? .25 : stipple < .47 ? .61 : 1;
        const grain = (random() - .5) * 9;
        const stars = random() > .995 ? 16 : 0;
        const fade = Math.exp(-Math.max(0, v - .9) * 3);
        const i = (y * width + x) * 4;
        pixels.data[i] = (12 + (blue * 13 + cyan * 28 + rim * 106 + amber * 134) * dither * daylight + grain + stars) * fade;
        pixels.data[i + 1] = (14 + (blue * 43 + cyan * 66 + rim * 82 + amber * 47) * dither * daylight + grain + stars) * fade;
        pixels.data[i + 2] = (17 + (blue * 82 + cyan * 90 + rim * 40 + amber * 9) * dither * daylight + grain + stars) * fade;
        // Leave the approved original calculations above intact. Optional
        // experiments only substitute colors, preserving geometry and grain.
        if (palette) {
          for (let channel = 0; channel < 3; channel++) {
            const light = blue * palette.blue[channel] + cyan * palette.cyan[channel] + rim * palette.rim[channel] + amber * palette.amber[channel];
            pixels.data[i + channel] = (palette.base[channel] + light * dither * daylight + grain + stars) * fade;
          }
        }
        pixels.data[i + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
  }
  const observer = observeBackgroundResize(host, () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
  draw();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
