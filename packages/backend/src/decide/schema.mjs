// Tiny JSON Schema subset: type, enum, required, properties, items, minimum, maximum, additionalProperties:false.
// Returns a list of error strings; empty means valid.
export function check(s, v, p = '$') {
  const ty = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const t = s.type;
  if (t && !(t === ty || (t === 'integer' && Number.isInteger(v)))) return [`${p}: expected ${t}`];
  if (t === 'number' && !Number.isFinite(v)) return [`${p}: expected a finite number`];
  const e = [];
  if (s.enum && !s.enum.includes(v)) e.push(`${p}: not one of ${s.enum.join('|')}`);
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) e.push(`${p}: below ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) e.push(`${p}: above ${s.maximum}`);
  }
  if (ty === 'array' && s.items) v.forEach((x, i) => e.push(...check(s.items, x, `${p}[${i}]`)));
  if (t === 'object') {
    for (const k of s.required ?? []) if (!Object.hasOwn(v, k)) e.push(`${p}.${k}: required`);
    for (const [k, sub] of Object.entries(s.properties ?? {})) if (Object.hasOwn(v, k)) e.push(...check(sub, v[k], `${p}.${k}`));
    if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!s.properties?.[k]) e.push(`${p}.${k}: not allowed`);
  }
  return e;
}
