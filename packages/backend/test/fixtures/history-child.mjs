// Runs one scan in a fresh process and prints numbers only: node history-child.mjs <srcDir> <home> [iterations]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [, , src, home] = process.argv;
const { createHistory } = await import(pathToFileURL(path.join(src, 'index.mjs')).href);
const h = createHistory({ home, clock: { now: Date.now }, ...(process.argv[4] ? { indexPath: process.argv[4] } : {}) });
const t0 = performance.now();
const stat = await h.scan();
const ms = Math.round(performance.now() - t0);
const t1 = performance.now();
const again = await h.scan();
const ms2 = Math.round(performance.now() - t1);
console.log(JSON.stringify({ ms, ms2, maxRSS_MB: Math.round(process.resourceUsage().maxRSS / 1024 * 10) / 10, total: h.list({ limit: 1e9, kinds: null }).length, stat, again }));
