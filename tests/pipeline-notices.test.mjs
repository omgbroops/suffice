import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdvisoryNotices} from '../src/pipeline/notices.mjs';

const read = {path:'index.mjs',sha256:'a'.repeat(64),startLine:1,endLine:20,bytes:200};
test('reread notices require unchanged active context and remain advisory', () => {
  const a = createAdvisoryNotices({sessionId:'a'}), b=createAdvisoryNotices({sessionId:'b'});
  assert.deepEqual(a.observeRead(read), []);
  assert.deepEqual(b.observeRead(read), []);
  const [notice]=a.observeRead(read);
  assert.equal(notice.kind, 'repeated_read');
  assert.equal(notice.blocksTool,false);
  assert.equal(notice.advisory,true);
  assert.deepEqual(a.observeRead({...read,sha256:'b'.repeat(64)}), []);
  a.forgetReadContext();
  assert.deepEqual(a.observeRead(read), []);
  assert.equal(a.observeRead({...read,bytes:20000})[1].kind, 'large_read');
});

test('failure notices reset after source, diagnostics or success changes', () => {
  const notices=createAdvisoryNotices({sessionId:'test'});
  const command={command:'node --test',exitCode:1,errorSignature:'assertion on line 5',sourceFingerprint:'revision-1'};
  assert.deepEqual(notices.observeCommand(command),[]);
  assert.equal(notices.observeCommand(command)[0].kind,'repeated_failure');
  assert.deepEqual(notices.observeCommand({...command,errorSignature:'type error'}),[]);
  assert.deepEqual(notices.observeCommand({...command,sourceFingerprint:'revision-2'}),[]);
  assert.deepEqual(notices.observeCommand({...command,exitCode:0}),[]);
  assert.deepEqual(notices.observeCommand(command),[]);
});

test('poll notices reset on output or completion and memory is bounded', () => {
  const notices=createAdvisoryNotices({sessionId:'test',maxEntries:1,pollingThreshold:2});
  notices.observePoll({handle:'a'});
  assert.equal(notices.observePoll({handle:'a'})[0].kind,'polling');
  notices.observePoll({handle:'a',changed:true});
  assert.deepEqual(notices.observePoll({handle:'a'}),[]);
  notices.observePoll({handle:'b'});
  assert.deepEqual(notices.observePoll({handle:'a'}),[]);
  notices.observePoll({handle:'a',complete:true});
  assert.deepEqual(notices.observePoll({handle:'a'}),[]);
});
