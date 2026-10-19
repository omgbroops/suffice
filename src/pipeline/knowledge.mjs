import {createHash} from 'node:crypto';
import {verifySourceReferences} from './context.mjs';

function receipt(value) {
  if (!value || value.success !== true || typeof value.id !== 'string' || !value.id || typeof value.taskId !== 'string' || !value.taskId || typeof value.command !== 'string' || !value.command || !Number.isFinite(Date.parse(value.completedAt))) throw Error('A successful explicit verification receipt is required');
  return structuredClone(value);
}

function freshReplay(runbook, value) {
  const replay=receipt(value);
  if(replay.id===runbook.verification.id || replay.taskId===runbook.taskId || replay.freshReplay!==true || Date.parse(replay.completedAt)<Date.parse(runbook.verification.completedAt)) throw Error('A distinct fresh replay verification is required');
  return replay;
}

export function createRunbook({id, taskId, lesson, references, verification}) {
  if (typeof id !== 'string' || !id || typeof taskId !== 'string' || !taskId || typeof lesson !== 'string' || !lesson.trim() || Buffer.byteLength(lesson) > 4000) throw Error('A bounded runbook identity and lesson are required');
  if (!Array.isArray(references) || !references.length || references.length > 20 || references.some(item => typeof item.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256))) throw Error('Source hash references are required');
  const checked = receipt(verification);
  if (checked.taskId !== taskId) throw Error('Verification must belong to the source task');
  return {version: 'runbook-v1', id, taskId, lesson, references: structuredClone(references), verification: checked, status: 'candidate'};
}

/** Promotion needs a distinct, fresh replay; no model assertion can promote a runbook. */
export async function promoteRunbook({workspace, runbook, replayVerification}) {
  if (runbook?.version !== 'runbook-v1' || runbook.status !== 'candidate') throw Error('Expected a candidate runbook');
  const candidate=createRunbook(runbook);
  const replay=freshReplay(candidate,replayVerification);
  const freshness = await verifySourceReferences({workspace, references: candidate.references});
  if (!freshness.fresh) throw Error('Runbook source references are stale');
  return {...candidate, status: 'verified', replayVerification: replay};
}

export async function getReusableRunbooks({workspace, runbooks = [], maxEntries = 4, maxBytes = 6000}) {
  if (!Array.isArray(runbooks) || runbooks.length > 100 || !Number.isInteger(maxEntries) || maxEntries < 0 || maxEntries > 20 || !Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > 20000) throw Error('Expected bounded runbook selection');
  const reusable = [], excluded = [];
  let bytes = 0;
  for (const runbook of runbooks) {
    if (runbook?.status !== 'verified' || !runbook.replayVerification) { excluded.push({id: runbook?.id, reason: 'not_verified'}); continue; }
    // Recheck supplied receipt structure rather than trusting a status string alone.
    try {
      if(runbook.version!=='runbook-v1') throw Error('Invalid runbook version');
      const candidate=createRunbook(runbook);
      const canonical={...candidate,status:'verified',replayVerification:freshReplay(candidate,runbook.replayVerification)};
      const freshness = await verifySourceReferences({workspace, references: canonical.references});
      if (!freshness.fresh) { excluded.push({id: runbook.id, reason: 'stale_sources'}); continue; }
      const size = Buffer.byteLength(JSON.stringify(canonical));
      if (reusable.length >= maxEntries || bytes + size > maxBytes) { excluded.push({id: runbook.id, reason: 'selection_limit'}); continue; }
      reusable.push(canonical); bytes += size;
    } catch { excluded.push({id: runbook?.id, reason: 'invalid_evidence'}); }
  }
  return {reusable, excluded, byteUsage: bytes};
}

/** Returned artifact includes the complete input history, never a replacement session. */
export function createTaskHandoff({boundary, taskId, history, summary, references = [], maxBytes = 5000000}) {
  if (boundary !== true) throw Error('An explicit task boundary is required');
  if (typeof taskId !== 'string' || !taskId || !Array.isArray(history) || typeof summary !== 'string' || Buffer.byteLength(summary) > 12000 || !Array.isArray(references) || references.length > 100 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 50000000) throw Error('Invalid or oversized handoff');
  const encoded = JSON.stringify(history);
  if (Buffer.byteLength(encoded) > maxBytes) throw Error('History exceeds snapshot allowance; refusing to truncate');
  return {version: 'task-handoff-v1', taskId, summary, references: structuredClone(references), history: JSON.parse(encoded), historySha256: createHash('sha256').update(encoded).digest('hex'), resetsSession: false};
}
