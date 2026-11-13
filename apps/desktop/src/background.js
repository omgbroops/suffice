import { ACTIVE_BACKGROUND, backgroundPresets } from './backgrounds/presets.js';
import { mountAtmosphere as mountHorizon } from './backgrounds/horizon.js';
import { mountRidges } from './backgrounds/ridges.js';
import { mountOrbital } from './backgrounds/orbital.js';
import { mountGradientAscii } from './backgrounds/gradient-ascii.js';
import { mountSonarGrid } from './backgrounds/sonar-grid.js';
import { mountOceanicShimmer } from './backgrounds/oceanic-shimmer.js';
import { mountMoonlitLake } from './backgrounds/moonlit-lake.js';
import { mountNeonDither } from './backgrounds/neon-dither.js';
import './backgrounds/neon-skin.css';
import { mountNeonChrome } from './backgrounds/neon-chrome.js';

export function mountAtmosphere(canvas) {
  const requested = new URLSearchParams(window.location.search).get('background');
  let saved;try { saved=localStorage.getItem('suffice-background'); } catch {}
  const key = Object.hasOwn(backgroundPresets, requested) ? requested : Object.hasOwn(backgroundPresets,saved)?saved:ACTIVE_BACKGROUND;
  try { localStorage.setItem('suffice-background',key); } catch {}
  const preset = backgroundPresets[key];
  canvas.dataset.background = key;
  canvas.closest('.workspace')?.classList.toggle('background-none',preset.type==='none');
  canvas.hidden=preset.type==='none';
  if(preset.type==='none')return ()=>{};
  if (preset.type === 'oceanic-shimmer') return mountOceanicShimmer(canvas, preset);
  if (preset.type === 'neon-dither') { const off = [mountNeonDither(canvas, preset), mountNeonChrome()]; return () => off.forEach(f => f()); }
  if (preset.type === 'moonlit-lake') return mountMoonlitLake(canvas, preset);
  if (preset.type === 'sonar-grid') return mountSonarGrid(canvas, preset);
  if (preset.type === 'gradient-ascii') return mountGradientAscii(canvas, preset);
  if (preset.type === 'orbital') return mountOrbital(canvas, preset);
  return preset.type === 'horizon' ? mountHorizon(canvas, preset.palette) : mountRidges(canvas, preset);
}
