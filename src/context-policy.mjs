/**
 * Select a replacement model context from a Pi transcript. The transcript and its
 * messages are never changed. No summaries or tool results are synthesized.
 *
 * Modes: none, deterministic, llm, compaction. `select` is an injected async
 * function receiving { objective, candidates, protectedGroupIds, maxCharacters }.
 * It must return { selectedIds: string[] } using candidate IDs exactly.
 */
export async function selectContext(messages, options = {}) {
  if (!Array.isArray(messages)) throw new TypeError('messages must be an array');
  const aliases = { full: 'none', recent: 'deterministic', model: 'llm' };
  const mode = aliases[options.mode] ?? options.mode ?? 'none';
  if (!['none', 'deterministic', 'llm', 'compaction'].includes(mode)) throw new RangeError('Unknown context policy mode');
  const recentGroups = options.recentGroups ?? 3;
  const firstGroups = options.firstGroups ?? 0;
  const maxCharacters = options.maxCharacters ?? 24_000;
  const thresholdCharacters = options.thresholdCharacters ?? 32_000;
  for (const [key, value] of Object.entries({ recentGroups, firstGroups, maxCharacters, thresholdCharacters })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${key} must be a nonnegative safe integer`);
  }
  const inputCharacters = characters(messages);
  const telemetry = { mode, status: 'unchanged', inputMessages: messages.length, inputCharacters,
    outputMessages: messages.length, outputCharacters: inputCharacters, removedMessages: 0,
    removedCharacters: 0, selectedGroupIds: [], protectedGroupIds: [], selectorCalled: false,
    selectorLatencyMs: 0, thresholdTriggered: false };
  const unchanged = reason => ({ messages: [...messages], telemetry: { ...telemetry, reason } });
  if (mode === 'none') return unchanged('disabled');
  const parsed = groupTranscript(messages);
  if (parsed.error) {
    telemetry.status = 'fail_open';
    return unchanged(parsed.error);
  }
  const { groups, pinned } = parsed;
  const completeGroups = groups.filter(group => group.closed);
  const protectedGroups = completeGroups.slice(Math.max(0, completeGroups.length - recentGroups));
  for (const group of completeGroups.slice(0, firstGroups)) if (!protectedGroups.includes(group)) protectedGroups.push(group);
  for (const group of groups) if (!group.closed && !protectedGroups.includes(group)) protectedGroups.push(group);
  const protectedIds = new Set(protectedGroups.map(group => group.id));
  telemetry.protectedGroupIds = [...protectedIds];
  const candidates = groups.filter(group => group.closed && !protectedIds.has(group.id));
  const required = new Set([...pinned, ...protectedGroups.flatMap(group => group.indices)]);
  if (!candidates.length) return unchanged('no_historical_groups');

  let selectedIds;
  if (mode === 'compaction') {
    telemetry.thresholdTriggered = inputCharacters > thresholdCharacters;
    if (!telemetry.thresholdTriggered) return unchanged('below_threshold');
    selectedIds = [];
  } else if (mode === 'llm') {
    if (typeof options.select !== 'function') {
      telemetry.status = 'fail_open';
      return unchanged('selector_unavailable');
    }
    telemetry.selectorCalled = true;
    const started = performance.now();
    try {
      // Isolate the callback from user-owned transcript objects.
      const decision = await options.select({ objective: String(options.objective ?? ''),
        candidates: structuredClone(candidates.map(group => ({ id: group.id,
          messages: group.indices.map(index => messages[index]), characters: group.characters }))),
        protectedGroupIds: [...protectedIds], maxCharacters });
      telemetry.selectorLatencyMs = performance.now() - started;
      const allowed = new Set(candidates.map(group => group.id));
      if (!decision || !Array.isArray(decision.selectedIds) ||
          Object.keys(decision).some(key => key !== 'selectedIds') ||
          decision.selectedIds.some(id => typeof id !== 'string' || !allowed.has(id)) ||
          new Set(decision.selectedIds).size !== decision.selectedIds.length) {
        telemetry.status = 'fail_open';
        return unchanged('invalid_selection');
      }
      selectedIds = decision.selectedIds;
    } catch {
      telemetry.selectorLatencyMs = performance.now() - started;
      telemetry.status = 'fail_open';
      return unchanged('selector_error');
    }
  } else {
    const terms = new Set(words(String(options.objective ?? '')));
    const ranked = candidates.map(group => ({ ...group, score: relevance(group, messages, terms) }))
      .sort((a, b) => b.score - a.score || b.start - a.start);
    selectedIds = [];
    const selectedIndices = new Set(required);
    for (const group of ranked) {
      const proposed = new Set([...selectedIndices, ...group.indices]);
      if (characters(messages.filter((_, index) => proposed.has(index))) <= maxCharacters) {
        selectedIds.push(group.id);
        for (const index of group.indices) selectedIndices.add(index);
      }
    }
  }
  const selected = new Set(selectedIds);
  for (const group of candidates) if (selected.has(group.id)) for (const index of group.indices) required.add(index);
  const replacement = messages.filter((_, index) => required.has(index));
  const outputCharacters = characters(replacement);
  return { messages: replacement, telemetry: { ...telemetry,
    status: replacement.length === messages.length ? 'unchanged' : 'selected',
    selectedGroupIds: candidates.filter(group => selected.has(group.id)).map(group => group.id),
    outputMessages: replacement.length, outputCharacters,
    removedMessages: messages.length - replacement.length,
    removedCharacters: inputCharacters - outputCharacters,
    requiredCharacters: characters(messages.filter((_, index) =>
      pinned.includes(index) || protectedGroups.some(group => group.indices.includes(index)))),
    budgetExceeded: outputCharacters > maxCharacters } };
}

function characters(value) { return JSON.stringify(value).length; }
function words(text) { return text.toLowerCase().match(/[a-z0-9_./-]{3,}/g) ?? []; }
function relevance(group, messages, terms) {
  const evidence = new Set(words(group.indices.map(index => JSON.stringify(messages[index].content ?? '')).join(' ')));
  return [...terms].reduce((total, term) => total + Number(evidence.has(term)), 0);
}

function groupTranscript(messages) {
  const groups = [], pinned = [], callIds = new Set();
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!message || typeof message.role !== 'string') return { error: 'invalid_message' };
    if (message.role === 'toolResult') return { error: 'orphan_tool_result' };
    if (message.role !== 'assistant') { pinned.push(index); continue; }
    if (!Array.isArray(message.content)) return { error: 'invalid_assistant_content' };
    if (message.content.some(block => !block || typeof block.type !== 'string')) return { error: 'invalid_assistant_content' };
    const calls = message.content.filter(block => block.type === 'toolCall');
    const pending = new Set();
    for (const call of calls) {
      if (typeof call.id !== 'string' || !call.id || callIds.has(call.id)) return { error: 'invalid_tool_call_ids' };
      pending.add(call.id); callIds.add(call.id);
    }
    const start = index, indices = [index];
    while (messages[index + 1]?.role === 'toolResult') {
      const result = messages[++index];
      if (!pending.delete(result.toolCallId)) return { error: 'unmatched_tool_result' };
      indices.push(index);
    }
    // A pending call at the live tail must stay in the replacement context.
    // An unfinished historical call is unsafe to select around, so fail open.
    if (pending.size && index !== messages.length - 1) return { error: 'incomplete_historical_group' };
    groups.push({ id: `g${start}`, start, indices, closed: pending.size === 0,
      characters: characters(indices.map(i => messages[i])) });
  }
  return { groups, pinned };
}
