// opencode plugin: runs SUFFICE_GATE_CMD before every tool call. Exit 0 allows; anything else blocks (fails closed).
import {spawnSync} from 'node:child_process';

export const SufficeGate = async () => ({
  'tool.execute.before': async (input, output) => {
    const cmd = process.env.SUFFICE_GATE_CMD;
    if (!cmd) throw new Error('suffice gate: hook unavailable');
    const r = spawnSync('/bin/sh', ['-c', cmd], {
      input: JSON.stringify({tool_name: input.tool, tool_input: output.args ?? {}}),
      timeout: 10000,
    });
    if (r.status === 0) return;
    throw new Error(String(r.stderr ?? '').trim() || 'suffice gate: blocked');
  },
});
