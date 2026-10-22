import { join } from 'node:path';
import { localize, snippet } from './v5-index.mjs';

export const V5_BUNDLE_TOKENS = 1500;

// Estimate only (about 4 chars per token), not a real tokenizer.
export const estTokens = s => Math.ceil(s.length / 4);

// Top-k localized files with an excerpt each. Stops at the token cap; the last excerpt is clipped to fit.
export async function buildBundle(repoDir, issue, { k = 5, maxTokens = V5_BUNDLE_TOKENS } = {}) {
  const { files } = await localize(repoDir, issue, { k });
  const parts = [], bundledFiles = [];
  let used = 0;
  for (const f of files) {
    const room = maxTokens - used;
    if (room <= 0) break;
    const block = `--- ${f.path}\n${snippet(join(repoDir, f.path), f.symbols[0]?.line)}`;
    const clipped = block.length > room * 4 ? block.slice(0, room * 4) : block;
    parts.push(clipped);
    bundledFiles.push(f.path);
    used += estTokens(clipped);
    if (clipped !== block) break;
  }
  return { files: files.map(f => f.path), bundledFiles, bundle: parts.join('\n\n'), bundleTokens: used };
}

// The prompt carries the issue, the ranked list and the excerpts. Gold files never enter it; the bench only reports them.
export function v5Prompt(issue, { files, bundle }) {
  const list = files.map((p, i) => `${i + 1}. ${p}`).join('\n');
  return `${issue}\n\nLikely files, most likely first (start here; do not search the repo):\n${list}\n\nExcerpts:\n${bundle}`;
}
