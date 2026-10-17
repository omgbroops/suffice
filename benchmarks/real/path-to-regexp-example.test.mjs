import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// Free gate: replays the one example printed in the symptom-only prompt.
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
test('prompt example no longer matches', () => assert.equal(require('./index.js')('/:a-:b-:c').exec('/1-2-3--4'), null));
