import { resolveName } from './registry.mjs';
export function buildOrder({ nodes, aliases = {} }, roots) {
  const done = new Set(); const active = new Set(); const order = [];
  function visit(name) {
    const target = resolveName(name, nodes, aliases);
    if (done.has(name)) return;
    if (active.has(name)) throw new Error('Dependency cycle: ' + name);
    active.add(name);
    for (const dependency of nodes[target].dependencies ?? []) visit(dependency);
    active.delete(name); done.add(name); order.push(target);
  }
  for (const root of roots) visit(root);
  return order;
}
