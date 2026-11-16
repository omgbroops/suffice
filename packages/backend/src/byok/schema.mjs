// Small JSON Schema subset: type, enum, required, properties, additionalProperties:false, items. Returns a list of error strings ([] = valid).
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isType = (t, v) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeOf(v) === t);

export function validate(schema, value, path = '$') {
  if (!schema || typeof schema !== 'object') return [];
  const errs = [], at = path === '$' ? '' : `${path}: `;
  if (schema.type !== undefined) {
    const ts = [].concat(schema.type);
    if (!ts.some((t) => isType(t, value))) return [`${at}expected ${ts.join(' or ')}, got ${typeOf(value)}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errs.push(`${at}value not in enum`);
  const isObj = typeOf(value) === 'object';
  if (isObj) {
    const miss = (schema.required ?? []).filter((k) => !Object.hasOwn(value, k));
    if (miss.length) errs.push(`${at}missing required keys: ${miss.join(', ')}`);
    const props = schema.properties ?? {};
    for (const k of Object.keys(props)) if (Object.hasOwn(value, k)) errs.push(...validate(props[k], value[k], `${path}.${k}`));
    if (schema.additionalProperties === false) {
      const extra = Object.keys(value).filter((k) => !Object.hasOwn(props, k));
      if (extra.length) errs.push(`${at}unexpected keys: ${extra.join(', ')}`);
    }
  } else if (schema.type === undefined && (schema.required || schema.properties) && typeOf(value) !== 'object') {
    errs.push(`${at}expected object, got ${typeOf(value)}`);
  }
  if (typeOf(value) === 'array' && schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  return errs;
}
