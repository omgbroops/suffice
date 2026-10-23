import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actorPrompt} from '../scripts/poly27-container-entry.mjs';
test('both actors get the public contract/helper and no evaluator metadata', () => {
  const prompt = actorPrompt({name: 'sublist', lang: 'cpp', prompt: 'Classify list containment.', graderDescriptor: '/private/grader.json', hiddenTests: ['secret-assertions.cpp'], expected: 'PRIVATE-ANSWER'});
  assert.match(prompt, /Classify list containment/); assert.match(prompt, /poly27-public-check.mjs cpp/);
  assert.doesNotMatch(prompt, /private\/grader|secret-assertions|PRIVATE-ANSWER/);
  assert.throws(() => actorPrompt({name: '../escape', lang: 'cpp', prompt: 'x'}), /Unsupported/);
});
