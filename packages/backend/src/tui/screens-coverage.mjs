// What the screen layer covers, counted from the recorded Claude Code captures (INDEX.json + the .txt files).
import fs from 'node:fs';
import { classifyScreen, TERMINAL_KINDS } from './screens.mjs';
import { PARSERS } from './screens-parsers.mjs';

export function screensCoverage(dir, expected) {
  const index = JSON.parse(fs.readFileSync(`${dir}/INDEX.json`, 'utf8'));
  const want = new Map(expected.map((r) => [r[0], r[1]]));
  const neverOpened = {};
  for (const s of index.skipped ?? []) neverOpened[s.reason] = (neverOpened[s.reason] ?? 0) + 1;
  let classifiedCorrectly = 0, withParser = 0, fallbackNotice = 0;
  const fallback = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
  for (const f of files) {
    const text = fs.readFileSync(`${dir}/${f}.txt`, 'utf8');
    const { kind } = classifyScreen(text);
    if (kind === want.get(f)) classifiedCorrectly++;
    if (Object.values(PARSERS).some((p) => p(text))) withParser++;
    else if (TERMINAL_KINDS.includes(kind)) { fallbackNotice++; fallback.push(f); }
  }
  return { commandsTotal: index.commands?.length ?? index.total ?? 0, captured: files.length, classifiedCorrectly, withParser, fallbackNotice, fallback, neverOpened };
}
