export function resolveName(name, nodes, aliases) {
  const target = aliases[name] ?? name;
  if (!(target in nodes)) throw new Error('Unknown node: ' + target);
  return target;
}
