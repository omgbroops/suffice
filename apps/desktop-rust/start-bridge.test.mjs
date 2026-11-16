import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {sessionArtifactName} from '../../scripts/rust-migration/session-native-artifact.mjs';
import {verifySessionBackend} from './start-bridge.mjs';

test('missing and unreceipted host addons fail before starting a bridge', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'suffice-host-preflight-'));
  t.after(() => rm(scratch, {recursive: true, force: true}));
  await assert.rejects(verifySessionBackend(scratch), /session addon is missing.*build-session-native\.mjs/);
  await writeFile(join(scratch, sessionArtifactName()), 'unreceipted');
  await assert.rejects(verifySessionBackend(scratch), /ENOENT.*build-session-native\.mjs/);
});
