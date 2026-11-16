#!/usr/bin/env node
// Classifies every non-empty Claude thinking block that did not yield a NEW thinking item. Prints bucket names and counts only.
// Text is hashed in memory (never printed). Usage: node diag-thinking.mjs [home]
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClaudeMapper } from '../../src/tui/claude.mjs';
import { discover, eachLine, san } from './replay.mjs';

const H = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const enumish = (v) => (typeof v === 'string' && /^[a-z_]{1,24}$/.test(v) ? v : typeof v);

export async function diagnose({ home = os.homedir(), maxSub = 400, maxHeadless = 400 } = {}) {
  const { plan } = await discover({ home, maxSub, maxHeadless });
  const B = Object.fromEntries(['emitted_new', 'a_exact_duplicate', 'b_same_msg_different_text', 'c_skipped_line_type', 'd_sidechain_skipped', 'e_message_shape', 'f_after_thinking_drop', 'h_whitespace_only', 'g_unexplained'].map((k) => [k, 0]));
  const info = { blocks: 0, emittedSameMsgDifferentText: 0, emittedDuplicateOfMsg: 0, distinct: 0, distinctEmitted: 0, dropKeys: {}, dropEnums: {}, shapeKeys: {}, skippedTypes: {} };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const st = { bytes: 0, skippedLong: 0, unreadable: 0 };
  const mine = createClaudeMapper(), side = createClaudeMapper({ includeSidechain: true });
  for (const [g, entries] of Object.entries(plan)) {
    if (!g.startsWith('claude')) continue;
    const mapper = g === 'claude.subagent' ? side : mine;
    for (const e of entries) {
      const state = mapper.newState();
      const seen = new Map(); // message key -> Set(hash) of non-empty blocks seen
      const emittedKeys = new Set(), emittedItemIds = new Set();
      let dropPending = null; const blobHashes = [], assistantHashes = new Set();
      await eachLine(e.path, (text) => {
        let obj; try { obj = JSON.parse(text); } catch { return false; }
        if (!obj || typeof obj !== 'object') return false;
        const out = mapper.mapLine(obj, state);
        if (obj.type === 'attachment' && obj.attachment?.type === 'thinking_drop') {
          dropPending = obj.attachment;
          return false;
        }
        const c = obj.message?.content;
        if (!Array.isArray(c)) return false;
        const mid = typeof obj.message?.id === 'string' ? obj.message.id : typeof obj.uuid === 'string' ? obj.uuid : '(none)';
        for (const b of c) {
          if (b?.type !== 'thinking' || typeof b.thinking !== 'string' || !b.thinking.length) continue;
          info.blocks++;
          const h = H(b.thinking), set = seen.get(mid) ?? new Set(), key = `${mid}|${h}`;
          const fresh = out.some((it) => it.kind === 'thinking' && it.text === b.thinking && !emittedItemIds.has(it.id));
          const dupMsg = set.has(h), otherText = set.size > 0 && !dupMsg;
          if (!emittedKeys.has(key)) { info.distinct++; }
          if (fresh) {
            for (const it of out) if (it.kind === 'thinking') emittedItemIds.add(it.id);
            B.emitted_new++;
            if (!emittedKeys.has(key)) info.distinctEmitted++;
            emittedKeys.add(key);
            if (dupMsg) info.emittedDuplicateOfMsg++; else if (otherText) info.emittedSameMsgDifferentText++;
          } else if (obj.type !== 'assistant') { B.c_skipped_line_type++; inc(info.skippedTypes, san(obj.type)); blobHashes.push(h); }
          else if (dupMsg) B.a_exact_duplicate++;
          else if (otherText) B.b_same_msg_different_text++;
          else if (obj.isSidechain === true && mapper === mine) B.d_sidechain_skipped++;
          else if (obj.isApiErrorMessage || typeof obj.message?.role !== 'string' || obj.message.role !== 'assistant') { B.e_message_shape++; for (const k of Object.keys(obj.message ?? {})) inc(info.shapeKeys, san(k)); }
          else if (dropPending) { B.f_after_thinking_drop++; for (const [k, v] of Object.entries(dropPending)) { inc(info.dropKeys, san(k)); if (k === 'type' || typeof v !== 'object') inc(info.dropEnums, `${san(k)}=${enumish(v)}`); } }
          else if (!b.thinking.trim()) B.h_whitespace_only++;
          else B.g_unexplained++;
          set.add(h); seen.set(mid, set); if (obj.type === 'assistant') assistantHashes.add(h);
        }
        if (obj.type === 'assistant') dropPending = null;
        return false;
      }, st);
      for (const h of blobHashes) info[assistantHashes.has(h) ? 'skippedTypeTextAlsoInAssistantLine' : 'skippedTypeTextOnlyThere'] = (info[assistantHashes.has(h) ? 'skippedTypeTextAlsoInAssistantLine' : 'skippedTypeTextOnlyThere'] || 0) + 1;
    }
  }
  return { buckets: B, info };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await diagnose({ home: process.argv[2] || os.homedir() });
  console.log(JSON.stringify(r, null, 1));
}
