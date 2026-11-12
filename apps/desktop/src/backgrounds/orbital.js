// A separate composition: a shadowed planetary limb under a broad, moonlit arc.
// The geometry and palette are independent of the saved diagonal horizon.
import { createFormation } from './formation.js';
import { observeBackgroundResize } from './resize.js';

export function mountOrbital(canvas, config) {
  const formation = createFormation(canvas, config);
  const bell = (d, spread) => Math.exp(-(d * d) / (2 * spread * spread));
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let frame;
  let drawn = false;
  function draw() {
    const pitch = config.pixelPitch;
    const width = Math.ceil(canvas.clientWidth / pitch);
    const height = Math.ceil(canvas.clientHeight / pitch);
    const fieldHeight = Math.max(800, Math.min(canvas.clientHeight, 1050)) / pitch;
    if (drawn && canvas.width === width && canvas.height === height) return;
    drawn = true;
    canvas.width = width; canvas.height = height;
    const image = new ImageData(width, height);
    let seed = config.seed;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    for (let y = 0; y < height; y++) {
      const v = y / fieldHeight;
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const dx = (u - config.center[0]) / config.radius[0];
        const dy = (v - config.center[1]) / config.radius[1];
        const distance = Math.sqrt(dx * dx + dy * dy) - 1;
        const blue = bell(distance - .055, .105) * (1 - u * .35);
        const violet = bell(distance - .065, .072) * (.25 + u * .75);
        const rim = bell(distance, .008) * (.5 + .5 * bell(u - .36, .30));
        const shadow = 1 / (1 + Math.exp(-distance * 80));
        const pattern = bayer[(y % 4) * 4 + x % 4] / 16 + (random() - .5) * .28;
        const dither = pattern < .24 ? .29 : pattern < .47 ? .64 : 1;
        const grain = (random() - .5) * 7;
        const stars = distance > .24 && random() > .9993 ? 10 : 0;
        const fade = Math.exp(-Math.max(0, v - .95) * 2);
        const i = (y * width + x) * 4;
        const { base, atmosphere, dusk, edge } = config.palette;
        for (let channel = 0; channel < 3; channel++) {
          const light = blue * atmosphere[channel] + violet * dusk[channel] + rim * edge[channel];
          image.data[i + channel] = (base[channel] * (.75 + .25 * shadow) + light * dither * config.exposure + grain + stars) * fade;
        }
        image.data[i + 3] = 255;
      }
    }
    formation.setTexture(image, { fieldHeight });
  }
  const observer = observeBackgroundResize(canvas, () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
  draw();
  return () => {
    observer.disconnect(); cancelAnimationFrame(frame);
    formation.dispose();
  };
}
