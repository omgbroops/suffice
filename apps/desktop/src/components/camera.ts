export const MOON = { x: 0.68, y: 0.27 }
export const DURATION = 1400

export const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3)

/** Where the camera is after `ms` of moving toward (up) or away from (!up) the moon, starting from `from` (0 = resting, 1 = moon centred). */
export function tiltAt(from: number, up: boolean, ms: number): number {
  const to = up ? 1 : 0
  return from + (to - from) * easeOut(ms / DURATION)
}

/** Where the moon ends up on screen when the camera has looked up at it: centred, above the composer, closer. */
export const VIEW = { x: 0.5, y: 0.2, zoom: 1.4 }

/** Screen point (px, py in 0..1) -> scene point at `tilt`. 0 = resting view; 1 = zoomed on the moon at VIEW, so the
 *  horizon drops out of frame and the camera reads as looking up. */
export function viewAt(tilt: number, px: number, py: number) {
  const tx = MOON.x + (VIEW.x - MOON.x) * tilt, ty = MOON.y + (VIEW.y - MOON.y) * tilt, z = 1 + (VIEW.zoom - 1) * tilt
  return { u: MOON.x + (px - tx) / z, v: MOON.y + (py - ty) / z }
}
