// A deliberately narrow syntactic heuristic. Unknown/dynamic programs return
// fewer matches, so they retain the normal watcher path. This is a cost policy,
// never an authorization or correctness decision.
export function plannedReads(code) {
  if (typeof code !== 'string' || code.length > 100_000) return new Set();
  const paths = new Set();
  for (const match of code.matchAll(/tools\.file_read\(\s*\{\s*path\s*:\s*(['"])([^'"\r\n]+)\1\s*[,}]/g)) paths.add(match[2]);
  // Common batch idiom: for (const path of ["a", "b"]) ... file_read({path}).
  for (const match of code.matchAll(/for\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+\[([^\]]{1,8000})\]\s*\)/g)) {
    const name = match[1];
    const rest = code.slice(match.index + match[0].length);
    const use = new RegExp(`tools\\.file_read\\(\\s*\\{\\s*(?:path\\s*:\\s*${name}|${name === 'path' ? 'path' : '(?!)'})\\s*[,}]`);
    if (!use.test(rest)) continue;
    const items = match[2].trim();
    if (!/^\s*(?:'[^'\r\n]*'|"[^"\r\n]*")\s*(?:,\s*(?:'[^'\r\n]*'|"[^"\r\n]*")\s*)*,?\s*$/.test(items)) continue;
    for (const value of items.matchAll(/(['"])([^'"\r\n]+)\1/g)) paths.add(value[2]);
  }
  return paths;
}
