// Safe condition language: JSON in, closure out. No dynamic code, own-property reads only.
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 8, MAX_NODES = 64, MAX_PATTERN = 64;

// stable JSON: sorted keys, so equal inputs give equal strings
export const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

export function lookup(obj, path) {
  let cur = obj;
  for (const k of String(path).split('.')) {
    if (BAD.has(k) || cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

const cmp = (f) => (x, y) => typeof x === typeof y && (typeof x === 'number' || typeof x === 'string') && f(x, y);
const OPS = {
  eq: (x, y) => canon(x) === canon(y),
  ne: (x, y) => canon(x) !== canon(y),
  gt: cmp((x, y) => x > y), gte: cmp((x, y) => x >= y), lt: cmp((x, y) => x < y), lte: cmp((x, y) => x <= y),
  in: (x, y) => (Array.isArray(y) ? y.some((v) => canon(v) === canon(x)) : typeof x === 'string' && typeof y === 'string' && y.includes(x)),
};

// shortcut: nested-quantifier/backreference patterns are refused by a regex screen, not proven safe; inputs are cut to 2000 chars
export function compile(cond) {
  let nodes = 0;
  const count = () => { if (++nodes > MAX_NODES) throw new Error('rule too large'); };
  const operand = (x) => {
    count();
    if (x === null || ['string', 'number', 'boolean'].includes(typeof x)) return () => x;
    if (Array.isArray(x)) { const f = x.map(operand); return (i) => f.map((g) => g(i)); }
    if (x && typeof x === 'object' && Object.keys(x).length === 1 && typeof x.var === 'string') {
      if (x.var.split('.').some((k) => BAD.has(k))) throw new Error(`forbidden key in "${x.var}"`);
      return (i) => lookup(i, x.var);
    }
    throw new Error('bad operand');
  };
  const node = (c, d) => {
    if (d > MAX_DEPTH) throw new Error('rule too deep');
    count();
    const keys = c && typeof c === 'object' && !Array.isArray(c) ? Object.keys(c) : [];
    if (keys.length !== 1) throw new Error('rule node needs exactly one operator');
    const op = keys[0], a = c[op];
    if (op === 'not') { const f = node(a, d + 1); return (i) => !f(i); }
    if (op === 'and' || op === 'or') {
      if (!Array.isArray(a) || !a.length) throw new Error(`${op} needs a non-empty array`);
      const f = a.map((x) => node(x, d + 1));
      return op === 'and' ? (i) => f.every((g) => g(i)) : (i) => f.some((g) => g(i));
    }
    if (!Array.isArray(a) || a.length !== 2) throw new Error(`${Object.hasOwn(OPS, op) || op === 'matches' ? op : 'unknown operator'} needs two operands`);
    if (op === 'matches') {
      const pat = a[1];
      if (typeof pat !== 'string' || pat.length > MAX_PATTERN) throw new Error('bad pattern: must be a literal string of at most 64 chars');
      if (/\\[1-9k]|\([^)]*[+*][^)]*\)[+*{]|\(\?[<=!]/.test(pat)) throw new Error('unsafe pattern');
      let re;
      try { re = new RegExp(pat); } catch { throw new Error('invalid pattern'); }
      const x = operand(a[0]);
      return (i) => { const v = x(i); return typeof v === 'string' && re.test(v.slice(0, 2000)); };
    }
    if (!Object.hasOwn(OPS, op)) throw new Error(`unknown operator "${op}"`);
    const [x, y] = a.map(operand);
    return (i) => OPS[op](x(i), y(i));
  };
  return node(cond, 0);
}
