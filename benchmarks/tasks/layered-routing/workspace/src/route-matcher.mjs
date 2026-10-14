import { patternScore } from './pattern-score.mjs';
export function matchRoute(routes, path) {
  return routes.find(route => patternScore(route.pattern, path) >= 0) ?? null;
}
