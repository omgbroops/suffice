import { overlaps, startsInWindow } from './intervals.mjs';
export function availableStarts({ windows, bookings, duration, stepMinutes = 15 }) {
  const starts = windows.flatMap(window => startsInWindow(window, duration, stepMinutes));
  return [...new Set(starts)].filter(start => !bookings.some(booking => overlaps({ start, end: start + duration }, booking))).sort((a, b) => a - b);
}
export function findEarliest(options, notBefore = 0) {
  return availableStarts(options).find(start => start >= notBefore) ?? null;
}
