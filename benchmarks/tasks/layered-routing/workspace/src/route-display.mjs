import { patternScore } from './pattern-score.mjs';
export function explain(routes, path) {
  return routes.map(route => ({ id: route.id, score: patternScore(route.pattern, path) }));
}
