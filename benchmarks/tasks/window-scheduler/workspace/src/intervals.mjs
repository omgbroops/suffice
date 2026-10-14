export function overlaps(a, b) { return a.start <= b.end && b.start <= a.end; }
export function startsInWindow(window, duration, stepMinutes) {
  const starts = [];
  for (let start = window.start; start + duration < window.end; start += stepMinutes) starts.push(start);
  return starts;
}
