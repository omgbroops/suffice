import test from 'node:test';
import assert from 'node:assert/strict';
import {displayRunError} from '../shared/run-error.mjs';
test('premature stream errors name the selected provider without changing unrelated errors',()=>{
 const raw="Error invoking remote method 'suffice:run': Error: OpenAI Responses stream ended before a terminal response event";
 assert.equal(displayRunError(raw,'xai'),"Grok's response stream ended before completion. Please try again.");
 assert.match(displayRunError(raw,'openai'),/^OpenAI's/);
 assert.match(displayRunError(raw,'custom'),/^The provider's/);
 assert.equal(displayRunError('Invalid API key','xai'),'Invalid API key');
});
