/** Session-local, advisory observations. These never deny, alter or execute a tool. */
export function createAdvisoryNotices({sessionId, largeReadBytes = 12000, repeatFailureThreshold = 2, pollingThreshold = 3, maxEntries = 256} = {}) {
  if (typeof sessionId !== 'string' || !sessionId || !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096 || !Number.isInteger(largeReadBytes) || largeReadBytes < 1 || !Number.isInteger(repeatFailureThreshold) || repeatFailureThreshold < 2 || !Number.isInteger(pollingThreshold) || pollingThreshold < 2) throw Error('A session identity and bounded thresholds are required');
  const reads = new Map(), failures = new Map(), polls = new Map();
  const notice = (kind, message) => ({kind, message, advisory: true, blocksTool: false});
  const put = (map, key, value) => { map.delete(key); map.set(key, value); if (map.size > maxEntries) map.delete(map.keys().next().value); };
  return {
    sessionId,
    observeRead({path, sha256, startLine = 1, endLine, bytes = 0, retained = true}) {
      if (typeof path !== 'string' || !path || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(endLine) || endLine < startLine || !Number.isFinite(bytes) || bytes < 0) throw Error('Invalid read observation');
      const output = [];
      const key = JSON.stringify([path, sha256, startLine, endLine]);
      if (reads.has(key) && retained) output.push(notice('repeated_read', 'This unchanged range was already read in the active session. Reuse it if it remains available, or read again when exact evidence is needed.'));
      if (bytes > largeReadBytes) output.push(notice('large_read', 'Consider an outline or relevant symbol range before including this large file. Full source access remains available.'));
      if (retained) put(reads, key, true); else reads.delete(key);
      return output;
    },
    observeCommand({command, exitCode, errorSignature = '', sourceFingerprint = ''}) {
      if (typeof command !== 'string' || !command || !Number.isInteger(exitCode) || typeof errorSignature !== 'string' || typeof sourceFingerprint !== 'string' || command.length > 20000 || errorSignature.length > 4000 || sourceFingerprint.length > 4000) throw Error('Invalid command observation');
      if (exitCode === 0) { failures.delete(command); return []; }
      const previous = failures.get(command);
      const signature = JSON.stringify([exitCode, errorSignature, sourceFingerprint]);
      const count = previous?.signature === signature ? previous.count + 1 : 1;
      put(failures, command, {signature, count});
      return count >= repeatFailureThreshold ? [notice('repeated_failure', 'The same command failed with unchanged diagnostics and source fingerprint. Consider investigating the cause before repeating it.')] : [];
    },
    observePoll({handle, complete = false, changed = false}) {
      if (typeof handle !== 'string' || !handle) throw Error('Invalid process handle');
      if (complete || changed) { polls.delete(handle); return []; }
      const count = (polls.get(handle) || 0) + 1;
      put(polls, handle, count);
      return count >= pollingThreshold ? [notice('polling', 'This process has not produced new output. Prefer its completion notification or a longer bounded poll when available.')] : [];
    },
    forgetReadContext() { reads.clear(); },
    reset() { reads.clear(); failures.clear(); polls.clear(); },
  };
}
