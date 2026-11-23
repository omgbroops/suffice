export const MOON = { x: 0.68, y: 0.27 }
export const DURATION = 1400

export const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3)

/** Where the camera is after `ms` of moving toward (up) or away from (!up) the moon, starting from `from` (0 = resting, 1 = moon centred). */
export function tiltAt(from: number, up: boolean, ms: number): number {
  const to = up ? 1 : 0
  return from + (to - from) * easeOut(ms / DURATION)
}

/** How far the scene shifts so the moon sits at the screen centre when tilt is 1. */
export const offsetAt = (tilt: number, aspect: number) => ({ x: (MOON.x - 0.5) * aspect * tilt, y: (MOON.y - 0.5) * tilt })
