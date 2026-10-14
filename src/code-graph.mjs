import { posix } from 'node:path';
import { filesIn, readText } from './workspace.mjs';

const extensions = ['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx'];
const normalize = path => path.replaceAll('\\', '/').replace(/^\.\//, '');

// Small lexical scanner, not an AST. Comments and string contents cannot create
// import edges; computed imports, template literals and aliases are unsupported.
function tokens(source) {
  const output = [];
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|`(?:\\[\s\S]|[^`])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[0];
    if (raw.startsWith('//') || raw.startsWith('/*') || raw.startsWith('`')) continue;
    const string = raw[0] === '"' || raw[0] === "'";
    output.push({ value: string ? raw.slice(1, -1).replace(/\\(['"\\])/g, '$1') : raw, string, index: match.index });
  }
  return output;
}

export function extractImports(source) {
  const lexemes = tokens(source);
  const imports = [];
  const add = (token, kind) => imports.push({ specifier: token.value, kind, line: source.slice(0, token.index).split('\n').length });
  for (let i = 0; i < lexemes.length; i++) {
    const token = lexemes[i];
    if (token.string || lexemes[i - 1]?.value === '.') continue;
    if (token.value === 'require' || token.value === 'import' && lexemes[i + 1]?.value === '(') {
      if (lexemes[i + 1]?.value === '(' && lexemes[i + 2]?.string && lexemes[i + 3]?.value === ')') add(lexemes[i + 2], token.value === 'require' ? 'require' : 'dynamic');
    } else if (token.value === 'import' || token.value === 'export') {
      if (token.value === 'import' && lexemes[i + 1]?.string) add(lexemes[i + 1], 'import');
      else {
        for (let j = i + 1; j < Math.min(i + 100, lexemes.length); j++) {
          if (lexemes[j].value === ';' || ['import', 'export'].includes(lexemes[j].value)) break;
          if (lexemes[j].value === 'from' && lexemes[j + 1]?.string) { add(lexemes[j + 1], token.value === 'export' ? 'reexport' : 'import'); break; }
        }
      }
    }
  }
  return imports;
}

/** File dependency graph; importers are potential callers, not symbol call sites. */
export async function buildCodeGraph(workspace) {
  const paths = (await filesIn(workspace)).filter(path => extensions.some(extension => path.endsWith(extension)));
  const known = new Set(paths);
  const nodes = [], edges = [], unresolved = [];
  for (const path of paths) {
    let source;
    try { source = await readText(workspace, path); }
    catch (error) { unresolved.push({ from: path, reason: 'unreadable', message: error.message }); continue; }
    const symbols = [...new Set(tokens(source).filter(token => !token.string && /^[A-Za-z_$][\w$]*$/.test(token.value)).map(token => token.value))].sort();
    nodes.push({ path, symbols, dependencies: [], importers: [] });
    for (const imported of extractImports(source)) {
      if (!imported.specifier.startsWith('.')) { unresolved.push({ from: path, ...imported, reason: 'external' }); continue; }
      const base = posix.normalize(posix.join(posix.dirname(path), imported.specifier));
      if (base === '..' || base.startsWith('../')) { unresolved.push({ from: path, ...imported, reason: 'outside-workspace' }); continue; }
      const candidates = [base, ...extensions.map(extension => base + extension), ...extensions.map(extension => posix.join(base, 'index' + extension))];
      const to = candidates.find(candidate => known.has(candidate));
      if (to) edges.push({ from: path, to, ...imported });
      else unresolved.push({ from: path, ...imported, reason: 'missing' });
    }
  }
  const byPath = new Map(nodes.map(node => [node.path, node]));
  for (const edge of edges) {
    const from = byPath.get(edge.from), to = byPath.get(edge.to);
    if (from && to) { from.dependencies.push(to.path); to.importers.push(from.path); }
  }
  for (const node of nodes) {
    node.dependencies = [...new Set(node.dependencies)].sort();
    node.importers = [...new Set(node.importers)].sort();
  }
  return { version: 1, nodes, edges, unresolved };
}

/** Deterministic BFS proximity plus lexical relevance, without reading more files. */
export function rankGraphCandidates(graph, { seeds = [], query = '', direction = 'both', maxDepth = 2, limit = 12, exclude = [] } = {}) {
  if (!['both', 'dependencies', 'importers'].includes(direction)) throw new Error('Invalid graph direction');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || !Number.isInteger(limit) || limit < 0) throw new Error('Depth and limit must be nonnegative integers');
  const nodes = new Map(graph.nodes.map(node => [node.path, node]));
  const distances = new Map(), queue = [];
  for (const seed of seeds.map(normalize)) if (nodes.has(seed) && !distances.has(seed)) { distances.set(seed, 0); queue.push(seed); }
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i], distance = distances.get(path), node = nodes.get(path);
    if (distance >= maxDepth) continue;
    const adjacent = [...(direction !== 'importers' ? node.dependencies : []), ...(direction !== 'dependencies' ? node.importers : [])];
    for (const neighbor of adjacent) if (nodes.has(neighbor) && !distances.has(neighbor)) { distances.set(neighbor, distance + 1); queue.push(neighbor); }
  }
  const terms = [...new Set(query.toLowerCase().match(/[a-z_$][\w$]*/g) ?? [])].filter(term => term.length > 1);
  const excluded = new Set(exclude.map(normalize));
  const candidates = [];
  for (const node of nodes.values()) {
    if (excluded.has(node.path)) continue;
    const distance = distances.get(node.path), reasons = [];
    let score = 0;
    if (distance !== undefined) { score += 100 / (distance + 1); reasons.push(distance === 0 ? 'seed' : `${direction}:${distance}`); }
    const symbols = new Set(node.symbols.map(symbol => symbol.toLowerCase()));
    for (const term of terms) {
      if (node.path.toLowerCase().includes(term)) { score += 12; reasons.push(`path:${term}`); }
      else if (symbols.has(term)) { score += 4; reasons.push(`symbol:${term}`); }
    }
    if (score > 0) candidates.push({ path: node.path, score: Math.round(score * 1000) / 1000, distance: distance ?? null, reasons });
  }
  return candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}
