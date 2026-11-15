// Pixel horizon is the default; earlier studies remain available.
// Preview any preset with ?background=<preset key>.
export const ACTIVE_BACKGROUND = 'horizon';

export const backgroundPresets = Object.freeze({
  none: Object.freeze({label: 'None',type: 'none'}),
  oceanic: Object.freeze({ label: 'Oceanic Shimmer', type: 'oceanic-shimmer', opacity: .22, lightOpacity: .16 }),
  lake: Object.freeze({ label: 'Moonlit lake', type: 'moonlit-lake', seed: 74281, pixelPitch: 3, exposure: .92 }),
  sonar: Object.freeze({
    label: 'Sonar grid', type: 'sonar-grid',
    props: Object.freeze({ spacing: 26, dotRadius: 1, baseOpacity: .16, pingEvery: 3.2, speed: 200, ringWidth: 90, amplitude: 1.7, maxRings: 4, interactive: true, seedPing: true }),
  }),
  ascii: Object.freeze({
    label: 'ASCII gradient', type: 'gradient-ascii', opacity: .34, lightOpacity: .17,
    props: Object.freeze({
      colors: ['#1e3fd8', '#f6f8ff', '#a5d8ff', '#38bdf8'],
      shape: 'horizon', characters: ' =+xX0S8#@', cellSize: 18,
      density: .8, glyphOpacity: .85, gradientOpacity: .85,
      glow: .15, depthOfField: 0, flicker: .06,
      softness: .55, scale: 1, flow: .3, speed: .4, grain: .03,
    }),
  }),
  orbital: Object.freeze({
    label: 'Orbital', type: 'orbital',
    seed: 291763, pixelPitch: 1.5, exposure: .90,
    center: [.52, 1.35], radius: [.83, 1.07],
    palette: Object.freeze({
      base: [10, 12, 17], atmosphere: [16, 33, 66],
      dusk: [36, 24, 59], edge: [90, 105, 137],
    }),
  }),
  softHorizon: Object.freeze({label:'Soft horizon',type:'soft-horizon'}),
  custom: Object.freeze({label:'Custom',type:'custom'}),
  horizon: Object.freeze({ label: 'Pixel horizon', type: 'horizon' }),
  dusk: Object.freeze({
    label: 'Dusk', type: 'horizon',
    palette: Object.freeze({ base: [13, 12, 18], blue: [38, 23, 76], cyan: [65, 36, 82], rim: [107, 70, 78], amber: [128, 45, 48] }),
  }),
  glacier: Object.freeze({
    label: 'Glacier', type: 'horizon',
    palette: Object.freeze({ base: [10, 15, 17], blue: [8, 47, 62], cyan: [23, 77, 76], rim: [81, 113, 98], amber: [17, 74, 66] }),
  }),
  ridges: Object.freeze({
    label: 'Dusk ridges',
    type: 'ridges',
    seed: 76419,
    pixelPitch: 1.5,
    ridgeWidth: 26,
    exposure: .84,
    grain: 5,
    palette: Object.freeze({
      base: [10, 10, 15],
      peach: [101, 67, 43],
      rose: [73, 13, 40],
      lavender: [39, 48, 90],
      plum: [24, 12, 33],
    }),
  }),
});
