import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const [kind, workspace, ...extra] = process.argv.slice(2);
if (!['retry', 'json-lines'].includes(kind) || !workspace || extra.length) {
  console.error('Usage: node grade-development.mjs <retry|json-lines> <workspace>');
  process.exit(2);
}

const check = (name, fn) => test(`${kind}: ${name}`, { timeout: 8000 }, fn);
const exportName = kind === 'retry' ? 'retry' : 'parseJsonLines';
let subject;
await check('public async API export is available', async () => {
  const module = await import(pathToFileURL(resolve(workspace, 'src', `${kind}.mjs`)).href);
  assert.equal(typeof module[exportName], 'function');
  subject = module[exportName];
});

async function rejectedValue(promise) {
  const outcome = await Promise.resolve(promise).then(
    value => ({ rejected: false, value }),
    value => ({ rejected: true, value }),
  );
  assert.equal(outcome.rejected, true, 'Expected rejection');
  return outcome.value;
}

async function collect(chunks) {
  const values = [];
  for await (const value of subject(chunks)) values.push(value);
  return values;
}

async function malformed(chunks, lineNumber, expectedBefore = []) {
  const values = [];
  let thrown;
  let didThrow = false;
  try {
    for await (const value of subject(chunks)) values.push(value);
  } catch (error) {
    didThrow = true;
    thrown = error;
  }
  assert.equal(didThrow, true, 'Malformed JSON must fail');
  assert.ok(thrown instanceof SyntaxError, 'Malformed JSON must throw SyntaxError');
  assert.equal(typeof thrown.lineNumber, 'number');
  assert.equal(thrown.lineNumber, lineNumber);
  assert.deepEqual(values, expectedBefore);
}

if (typeof subject === 'function' && kind === 'retry') {
  await check('immediate success returns the exact value and does no retry work', async () => {
    const result = { successful: true };
    const attempts = [];
    const actual = await subject(attempt => {
      attempts.push(attempt);
      return result;
    }, {
      attempts: 5,
      shouldRetry() { assert.fail('Predicate called after success'); },
      sleep() { assert.fail('Sleep called after success'); },
    });
    assert.strictEqual(actual, result);
    assert.deepEqual(attempts, [1]);
  });

  await check('default options allow three operations with one-based attempts', async () => {
    const calls = [];
    const result = await subject(async attempt => {
      calls.push(attempt);
      if (attempt < 3) throw new Error('transient');
      return 'recovered';
    });
    assert.equal(result, 'recovered');
    assert.deepEqual(calls, [1, 2, 3]);
  });

  await check('default budget, delay, predicate arguments, and final error identity', async () => {
    const errors = [new Error('first'), new Error('second'), new Error('third')];
    const calls = [];
    const predicates = [];
    const delays = [];
    const actual = await rejectedValue(subject(async attempt => {
      calls.push(attempt);
      throw errors[attempt - 1];
    }, {
      shouldRetry(error, attempt) {
        predicates.push([error, attempt]);
        return true;
      },
      async sleep(delay) { delays.push(delay); },
    }));
    assert.strictEqual(actual, errors[2]);
    assert.deepEqual(calls, [1, 2, 3]);
    assert.deepEqual(predicates, [[errors[0], 1], [errors[1], 2]]);
    assert.deepEqual(delays, [0, 0]);
  });

  await check('fractional finite base delay doubles only between retryable failures', async () => {
    const calls = [];
    const delays = [];
    assert.equal(await subject(async attempt => {
      calls.push(attempt);
      if (attempt < 5) throw new Error('again');
      return 41;
    }, { attempts: 5, baseDelayMs: 2.5, async sleep(ms) { delays.push(ms); } }), 41);
    assert.deepEqual(calls, [1, 2, 3, 4, 5]);
    assert.deepEqual(delays, [2.5, 5, 10, 20]);
  });

  await check('a single attempt never consults the predicate or sleeps', async () => {
    const failure = { unique: 'single failure' };
    const calls = [];
    const actual = await rejectedValue(subject(attempt => {
      calls.push(attempt);
      throw failure;
    }, {
      attempts: 1,
      shouldRetry() { assert.fail('No attempt remains'); },
      sleep() { assert.fail('No attempt remains'); },
    }));
    assert.strictEqual(actual, failure);
    assert.deepEqual(calls, [1]);
  });

  await check('false predicate stops at that failure without another sleep', async () => {
    const errors = [new Error('first'), new Error('stop')];
    const seen = [];
    const sleeps = [];
    const operations = [];
    const actual = await rejectedValue(subject(async attempt => {
      operations.push(attempt);
      throw errors[attempt - 1];
    }, {
      attempts: 5,
      baseDelayMs: 3,
      shouldRetry(error, attempt) {
        seen.push([error, attempt]);
        return attempt === 1;
      },
      async sleep(ms) { sleeps.push(ms); },
    }));
    assert.strictEqual(actual, errors[1]);
    assert.deepEqual(operations, [1, 2]);
    assert.deepEqual(seen, [[errors[0], 1], [errors[1], 2]]);
    assert.deepEqual(sleeps, [3]);
  });

  await check('predicate exceptions propagate unchanged without sleeping', async () => {
    const operationError = new Error('operation');
    const predicateError = new Error('predicate');
    let calls = 0;
    const actual = await rejectedValue(subject(async () => {
      calls += 1;
      throw operationError;
    }, {
      shouldRetry(error, attempt) {
        assert.strictEqual(error, operationError);
        assert.equal(attempt, 1);
        throw predicateError;
      },
      sleep() { assert.fail('Predicate failed'); },
    }));
    assert.strictEqual(actual, predicateError);
    assert.equal(calls, 1);
  });

  await check('sleep rejection propagates unchanged without another operation', async () => {
    const sleepError = new Error('sleep');
    let calls = 0;
    const actual = await rejectedValue(subject(async () => {
      calls += 1;
      throw new Error('operation');
    }, { async sleep() { throw sleepError; } }));
    assert.strictEqual(actual, sleepError);
    assert.equal(calls, 1);
  });

  await check('a synchronously thrown sleep error also propagates unchanged', async () => {
    const sleepError = { failedSleep: true };
    let calls = 0;
    const actual = await rejectedValue(subject(() => {
      calls += 1;
      throw new Error('operation');
    }, { sleep() { throw sleepError; } }));
    assert.strictEqual(actual, sleepError);
    assert.equal(calls, 1);
  });

  await check('sleep is awaited before the next operation', async () => {
    const events = [];
    assert.equal(await subject(async attempt => {
      events.push(`operation ${attempt}`);
      if (attempt === 1) throw new Error('transient');
      assert.equal(events.at(-2), 'sleep resolved');
      return 'done';
    }, {
      async sleep() {
        events.push('sleep started');
        await new Promise(resolveSleep => setImmediate(resolveSleep));
        events.push('sleep resolved');
      },
    }), 'done');
    assert.deepEqual(events, ['operation 1', 'sleep started', 'sleep resolved', 'operation 2']);
  });

  await check('attempts must be a positive integer before the operation runs', async () => {
    for (const attempts of [0, -1, 1.5, NaN, Infinity, -Infinity, '3', null, true, {}]) {
      let calls = 0;
      await rejectedValue(subject(() => { calls += 1; return 'success'; }, { attempts }));
      assert.equal(calls, 0, `Invalid attempts reached operation: ${String(attempts)}`);
    }
  });

  await check('baseDelayMs must be finite and nonnegative before the operation runs', async () => {
    for (const baseDelayMs of [-1, NaN, Infinity, -Infinity, '0', null, true, {}]) {
      let calls = 0;
      await rejectedValue(subject(() => { calls += 1; return 'success'; }, { attempts: 1, baseDelayMs }));
      assert.equal(calls, 0, `Invalid baseDelayMs reached operation: ${String(baseDelayMs)}`);
    }
  });

  await check('zero delay is valid even when no retry will be needed', async () => {
    assert.equal(await subject(() => 'ok', { attempts: 1, baseDelayMs: 0 }), 'ok');
  });

  await check('already aborted signals prevent all operations and preserve their reasons', async () => {
    for (const reason of [new Error('cancel'), { cancellation: true }, null, 0, false, '']) {
      const controller = new AbortController();
      controller.abort(reason);
      const actual = await rejectedValue(subject(() => { assert.fail('Already aborted'); }, {
        signal: controller.signal,
        shouldRetry() { assert.fail('Already aborted'); },
        sleep() { assert.fail('Already aborted'); },
      }));
      assert.strictEqual(actual, reason);
    }
  });

  await check('abort without an explicit reason rejects an Error named AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    const actual = await rejectedValue(subject(() => { assert.fail('Already aborted'); }, { signal: controller.signal }));
    assert.ok(actual instanceof Error);
    assert.equal(actual.name, 'AbortError');
  });

  await check('an abort during sleep is observed before any further operation', async () => {
    const controller = new AbortController();
    const reason = new Error('aborted while sleeping');
    const calls = [];
    const sleeps = [];
    const actual = await rejectedValue(subject(async attempt => {
      calls.push(attempt);
      throw new Error('transient');
    }, {
      attempts: 4,
      baseDelayMs: 7,
      signal: controller.signal,
      async sleep(ms) {
        sleeps.push(ms);
        await new Promise(resolveSleep => setImmediate(resolveSleep));
        controller.abort(reason);
      },
    }));
    assert.strictEqual(actual, reason);
    assert.deepEqual(calls, [1]);
    assert.deepEqual(sleeps, [7]);
  });

  await check('successful operation resolves immediately even if it aborts the signal', async () => {
    const controller = new AbortController();
    const value = { completed: true };
    assert.strictEqual(await subject(async () => {
      controller.abort(new Error('late abort'));
      return value;
    }, { signal: controller.signal }), value);
  });
}

if (typeof subject === 'function' && kind === 'json-lines') {
  const encoder = new TextEncoder();

  await check('sync text chunks yield every JSON value type in order', async () => {
    assert.deepEqual(await collect(['{"x":1}\n[2,"three"]\n"four"\n42\ntrue\nfalse\nnull\n']),
      [{ x: 1 }, [2, 'three'], 'four', 42, true, false, null]);
  });

  await check('empty streams and whitespace-only physical lines yield nothing', async () => {
    assert.deepEqual(await collect([]), []);
    assert.deepEqual(await collect(['', '\n \t\r\n', '\t  ', '']), []);
    assert.deepEqual(await collect([new Uint8Array(), encoder.encode('\n \t\r\n')]), []);
  });

  await check('text parses across every single boundary including CRLF and escapes', async () => {
    const text = '\n {"s":"a\\\"b\\n","n":12.5}\r\n\t\r\n[true,null]\n"end"';
    const expected = [{ s: 'a"b\n', n: 12.5 }, [true, null], 'end'];
    for (let boundary = 0; boundary <= text.length; boundary += 1) {
      assert.deepEqual(await collect([text.slice(0, boundary), '', text.slice(boundary)]), expected,
        `Text boundary ${boundary}`);
    }
    assert.deepEqual(await collect([...text]), expected);
  });

  await check('async iterables retain partial lines and parse a final nonempty line', async () => {
    async function* chunks() {
      for (const chunk of ['{"part', '":1}\r', '\n\n[', '2,3]', '\n', 'false']) {
        await Promise.resolve();
        yield chunk;
      }
    }
    assert.deepEqual(await collect(chunks()), [{ part: 1 }, [2, 3], false]);
  });

  await check('UTF-8 byte chunks decode across every single boundary and one-byte chunks', async () => {
    const bytes = encoder.encode('{"text":"é中😀"}\r\n"終"\n');
    const expected = [{ text: 'é中😀' }, '終'];
    for (let boundary = 0; boundary <= bytes.length; boundary += 1) {
      assert.deepEqual(await collect([bytes.subarray(0, boundary), new Uint8Array(), bytes.subarray(boundary)]), expected,
        `Byte boundary ${boundary}`);
    }
    assert.deepEqual(await collect(Array.from(bytes, byte => Uint8Array.of(byte))), expected);
  });

  await check('byte array views respect their offset and length', async () => {
    const encoded = encoder.encode('xx{"v":9}\nzz');
    const view = new Uint8Array(encoded.buffer, encoded.byteOffset + 2, encoded.byteLength - 4);
    assert.deepEqual(await collect([view]), [{ v: 9 }]);
  });

  await check('mixed text and bytes work at complete UTF-8 boundaries', async () => {
    assert.deepEqual(await collect(['{"a":', encoder.encode('[1,2]'), '}\n', encoder.encode('"é"\n'), '\nfalse']),
      [{ a: [1, 2] }, 'é', false]);
  });

  await check('one initial BOM is accepted across empty chunks and split UTF-8 bytes', async () => {
    assert.deepEqual(await collect(['', '\uFEFF', '{"bom":true}\n']), [{ bom: true }]);
    const bytes = encoder.encode('\uFEFF{"bom":"é"}\n');
    assert.deepEqual(await collect([new Uint8Array(), ...Array.from(bytes, byte => Uint8Array.of(byte))]), [{ bom: 'é' }]);
  });

  await check('a BOM is removed only once and only at the very start', async () => {
    await malformed(['\uFEFF\uFEFF{"x":1}\n'], 1);
    await malformed(['\n', '\uFEFF{"x":1}\n'], 2);
    await malformed([' ', '\uFEFF{"x":1}\n'], 1);
    await malformed([encoder.encode('\uFEFF\uFEFF{"x":1}\n')], 1);
  });

  await check('malformed lines have numeric physical line numbers including blanks', async () => {
    await malformed(['{bad}\n'], 1);
    await malformed(['\n \t\r\n{"ok":1}\r', '\n \n{bad}\n'], 5, [{ ok: 1 }]);
    await malformed(['true\n', '\n  [oops'], 3, [true]);
    await malformed([encoder.encode(' \r\n\n{"broken":}\r\n')], 3);
  });

  await check('upstream sync iterator failures retain exact identity', async () => {
    const failure = new Error('source failed');
    function* chunks() { throw failure; }
    assert.strictEqual(await rejectedValue(collect(chunks())), failure);
  });

  await check('upstream async iterator failures retain exact identity after prior values', async () => {
    const failure = { upstream: true };
    async function* chunks() {
      yield '{"ok":1}\n';
      throw failure;
    }
    const parsed = subject(chunks());
    assert.deepEqual(await parsed.next(), { value: { ok: 1 }, done: false });
    assert.strictEqual(await rejectedValue(parsed.next()), failure);
  });

  await check('a complete line is yielded while the upstream stream is still open', async () => {
    let release;
    const gate = new Promise(resolveGate => { release = resolveGate; });
    async function* chunks() {
      yield '{"early":true}\n';
      await gate;
      yield '{"later":true}\n';
    }
    const parsed = subject(chunks());
    let timer;
    try {
      const first = await Promise.race([
        parsed.next(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('A complete line was buffered until upstream completion')), 3000);
        }),
      ]);
      assert.deepEqual(first, { value: { early: true }, done: false });
      release();
      assert.deepEqual(await parsed.next(), { value: { later: true }, done: false });
      assert.equal((await parsed.next()).done, true);
    } finally {
      clearTimeout(timer);
      release();
      if (typeof parsed.return === 'function') await parsed.return();
    }
  });
}
