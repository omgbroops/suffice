import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const validation = JSON.parse(readFileSync(resolve(directory, 'validation.json'), 'utf8'));
assert.equal(validation.allExpectationsMet, true);

const rationale = {
  retry: [
    ['public async API export is available', 'The contract names src/retry.mjs and its retry export. Only callable export availability is asserted, without requiring a particular function-constructor name.'],
    ['immediate success returns the exact value and does no retry work', 'Resolve immediately on success; pass one-based attempt 1; do not consult retry policy or sleep after success. Returning an object must preserve its identity.'],
    ['default options allow three operations with one-based attempts', 'attempts defaults to 3, shouldRetry defaults to true, and sleep defaults to an async no-op. Two failures followed by success exercise all three defaults with operation attempts 1, 2, and 3.'],
    ['default budget, delay, predicate arguments, and final error identity', 'Defaults are three attempts and zero delay. Consult shouldRetry(error, attempt) only when another attempt remains; sleep only between retryable failures; reject the exact final error.'],
    ['fractional finite base delay doubles only between retryable failures', 'baseDelayMs is finite and nonnegative, with no integer requirement. With base 2.5 and four retryable failures, the specified formula gives 2.5, 5, 10, and 20; success permits no further sleep.'],
    ['a single attempt never consults the predicate or sleeps', 'One is a positive integer attempt budget. No other attempt remains after its failure, so do not consult the predicate or sleep. Exact rejection identity also applies to a non-Error thrown object.'],
    ['false predicate stops at that failure without another sleep', 'Consult shouldRetry with the current error and one-based attempt. A false decision stops retries, preserves the stopping error, and causes no sleep for that failure.'],
    ['predicate exceptions propagate unchanged without sleeping', 'Predicate errors propagate unchanged. A thrown predicate error ends retry processing before any sleep or next operation.'],
    ['sleep rejection propagates unchanged without another operation', 'Await sleep between retries. Its rejected error propagates unchanged, and no next operation can proceed.'],
    ['a synchronously thrown sleep error also propagates unchanged', 'The requirement that sleep errors propagate unchanged includes synchronous throws from the supplied sleep function.'],
    ['sleep is awaited before the next operation', 'Between retryable failures await sleep. A setImmediate-resolved sleep records completion before operation 2, without requiring a wall-clock delay.'],
    ['attempts must be a positive integer before the operation runs', 'Zero, negative, fractional, nonfinite, and nonnumber values are not positive integers. Validation must happen even if the operation would succeed immediately. No validation error class or message is asserted.'],
    ['baseDelayMs must be finite and nonnegative before the operation runs', 'Negative, nonfinite, and nonnumber values do not meet the finite nonnegative numeric delay contract. Validation must happen even with a single attempt and immediate success. No validation error class or message is asserted.'],
    ['zero delay is valid even when no retry will be needed', 'Zero satisfies finite and nonnegative. A positive integer budget of one and base zero must allow success.'],
    ['already aborted signals prevent all operations and preserve their reasons', 'Check the optional AbortSignal before an operation. An already aborted signal performs no operation, predicate, or sleep and rejects signal.reason. Explicit null, zero, false, and empty-string reasons are present reasons, so they must not be replaced based on truthiness. Native AbortController instances are used.'],
    ['abort without an explicit reason rejects an Error named AbortError', 'The abort outcome is the present signal.reason or an Error named AbortError when no reason is available. A normal native abort with no explicit argument produces that required observable AbortError outcome. This does not require duck-typed signals or override native getters.'],
    ['an abort during sleep is observed before any further operation', 'Check the signal after the awaited sleep and before another operation. The first backoff remains the specified base delay; reject the exact abort reason.'],
    ['successful operation resolves immediately even if it aborts the signal', 'The specified signal checks are before operations and after sleeps. A successful operation resolves immediately; no post-success check is specified.'],
  ],
  'json-lines': [
    ['public async API export is available', 'The contract names src/json-lines.mjs and its parseJsonLines export. Only callable export availability is asserted; generator behavior is tested through iteration.'],
    ['sync text chunks yield every JSON value type in order', 'Accept a sync iterable of strings and yield parsed JSON values in order, including objects, arrays, strings, numbers, booleans, and null.'],
    ['empty streams and whitespace-only physical lines yield nothing', 'Ignore blank and whitespace-only physical lines. Empty input and empty chunks contain no JSON value. Both text and byte chunks are accepted.'],
    ['text parses across every single boundary including CRLF and escapes', 'JSON lines must parse across arbitrary chunk boundaries, support LF and CRLF, ignore whitespace-only physical lines, and parse the final nonempty line without a newline. Exhausting one split position at a time and then character-sized chunks varies partitioning without depending on implementation internals.'],
    ['async iterables retain partial lines and parse a final nonempty line', 'Accept async iterables of strings, retain records across boundaries including a split CRLF, ignore blanks, and parse a final nonempty line without a newline.'],
    ['UTF-8 byte chunks decode across every single boundary and one-byte chunks', 'Accept Uint8Array chunks and decode UTF-8 multibyte sequences across byte boundaries. Valid two-, three-, and four-byte codepoints are tested at all single split positions and in one-byte chunks. No malformed UTF-8 expectation is added.'],
    ['byte array views respect their offset and length', 'A Uint8Array chunk is its viewed bytes, including its offset and length, rather than the entire backing buffer. JSON bytes outside the supplied view are not stream input.'],
    ['mixed text and bytes work at complete UTF-8 boundaries', 'Chunks may be strings or Uint8Array. Mixed chunks contain complete encoded codepoints at transitions, avoiding the explicitly unspecified case of a string inside an incomplete byte codepoint.'],
    ['one initial BOM is accepted across empty chunks and split UTF-8 bytes', 'Strip one optional initial UTF-8 BOM only at the beginning of the entire stream. Empty chunks do not move the stream start, and byte boundaries can split the BOM itself.'],
    ['a BOM is removed only once and only at the very start', 'Exactly one optional initial BOM may be stripped. A second BOM or a BOM following stream whitespace or a physical newline remains in a nonblank JSON line and makes that JSON malformed; the numeric physical line number is asserted. Both initial byte BOMs and text BOMs are covered.'],
    ['malformed lines have numeric physical line numbers including blanks', 'Malformed JSON throws SyntaxError carrying a numeric one-based physical lineNumber; blank lines still count. Earlier valid values are yielded in order. Malformed terminated lines and a malformed final unterminated line are included. No error-message wording is asserted.'],
    ['upstream sync iterator failures retain exact identity', 'Preserve upstream iterator error identity for a sync iterable. The parser must not wrap or relabel this non-JSON error.'],
    ['upstream async iterator failures retain exact identity after prior values', 'Preserve upstream iterator error identity for an async iterable. Incremental processing yields the prior complete valid line before requesting the failing next chunk. The thrown value need not be an Error instance.'],
    ['a complete line is yielded while the upstream stream is still open', 'Incremental processing must allow a complete JSON line to be yielded without waiting for upstream completion. An upstream gate remains closed until that yield is observed. The 3-second deadline is a hang guard, not a throughput requirement; the gate is released in cleanup. No particular memory bound, lookahead count, or final generator return value is asserted.'],
  ],
};

const graderSource = readFileSync(resolve(directory, 'grade-development.mjs'), 'utf8');
const authoredNames = [...graderSource.matchAll(/await check\('([^']+)'/g)].map(match => match[1]);
const expectedNames = [rationale.retry[0][0], ...rationale.retry.slice(1).map(row => row[0]), ...rationale['json-lines'].slice(1).map(row => row[0])];
assert.deepEqual(authoredNames, expectedNames, 'Every authored test needs a public-contract rationale');

const paths = [
  'grade-development.mjs',
  'reference/retry/src/retry.mjs',
  'reference/json-lines/src/json-lines.mjs',
  'validate-development.mjs',
  'freeze-development.mjs',
  'validation.json',
  ...validation.runs.flatMap(run => [run.stdout, run.stderr]),
];
const files = paths.map(path => {
  const bytes = readFileSync(resolve(directory, path));
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const summaries = validation.runs.map(run => {
  const stdout = readFileSync(resolve(directory, run.stdout), 'utf8');
  const count = name => Number(stdout.match(new RegExp(`tests ${name}`))?.[1] ?? 0);
  return {
    kind: run.kind,
    target: run.target,
    exitCode: run.exitCode,
    tests: Number(stdout.match(/tests (\d+)/)?.[1]),
    passed: Number(stdout.match(/pass (\d+)/)?.[1]),
    failed: Number(stdout.match(/fail (\d+)/)?.[1]),
  };
});

const manifest = {
  schemaVersion: 1,
  frozenAt: new Date().toISOString(),
  hashAlgorithm: 'SHA-256',
  status: 'Frozen before actor evaluation. Do not mutate the grader, references, rationale, or validation artifacts after this point.',
  invocation: 'node grade-development.mjs <retry|json-lines> <workspace>',
  exitSemantics: 'Uses node:test named tests with 8000 ms per-test timeouts; any failed assertion produces nonzero exit. Invalid harness arguments exit 2.',
  dependencies: 'Node.js built-ins only; validated with Node v24.18.0. No network requests or model calls.',
  scope: {
    inspectedOriginalSources: [
      '../../retry/src/retry.mjs',
      '../../json-lines/src/json-lines.mjs',
    ],
    writes: 'Only this evaluation/development directory.',
    actorFilesInspected: false,
    actorSolutionsEvaluated: false,
    actorFinalProseOrStatusInspected: false,
    actorReceiptsInspected: false,
    directoriesNamedAttemptsOrGradingInspected: false,
    runtimeOrRepoSourceEdited: false,
  },
  publicContracts: {
    retry: 'Implement src/retry.mjs exporting async retry(operation, options = {}). attempts default3, positive integer; baseDelayMs default0, finite nonnegative. Validate both before operation. sleep default async no-op, shouldRetry default predicate true. Pass one-based attempt to operation. Resolve immediately on success. Preserve exact rejection error identity. Consult shouldRetry(error,attempt) only when another attempt remains; false stops. Between retryable failures await sleep(baseDelayMs * 2 ** (attempt - 1)), never after success/final failure. Optional AbortSignal checked before each operation and after sleep; reject signal.reason when present, otherwise Error named AbortError. Already aborted => no operation. Predicate/sleep errors propagate unchanged. Preserve export/tests.',
    'json-lines': 'Implement src/json-lines.mjs exporting async generator parseJsonLines(chunks). Accept sync/async iterables of strings or Uint8Array chunks. Parse newline-delimited JSON across arbitrary chunk boundaries including UTF8 multibyte split across byte chunks. LF and CRLF separators. Ignore blank/whitespace-only physical lines. Parse final nonempty line without newline. Strip ONE optional initial UTF8 BOM only at very beginning of entire stream. Yield JSON values in order. Malformed JSON throws SyntaxError with numeric one-based physical lineNumber, counting blanks too. Preserve upstream iterator error identity. Incremental processing, preserve export/tests. Be careful not to require unspecified behavior for malformed UTF8 or arbitrary mixes of strings inside incomplete encoded codepoints.',
  },
  assertionRationale: Object.fromEntries(Object.entries(rationale).map(([kind, rows]) => [kind,
    rows.map(([test, publicContractBasis]) => ({ test: `${kind}: ${test}`, publicContractBasis })),
  ])),
  deliberateNonRequirements: [
    'No source-style, algorithm-shape, helper-name, exact validation-error class, or exact error-message requirements.',
    'No async shouldRetry behavior, invalid option-container behavior, invalid chunk types, malformed UTF-8 behavior, or mixed string/byte behavior inside an incomplete encoded codepoint is required.',
    'No cancellation event listener, real retry delay, fixed memory limit, exact iterator lookahead count, or generator final return value is required.',
    'Existing fixture tests are not edited or loaded. The standalone runtime contract grader loads only the named src module; minimal reference workspaces contain only src. Preservation of submitted fixture test files is not inferred from runtime behavior.',
  ],
  referenceIndependence: 'References were authored directly from the supplied public contracts after reading only the two original one-line source stubs. Expected grader values are explicit contract examples and are never computed by importing a reference implementation.',
  validation: { report: 'validation.json', allExpectationsMet: validation.allExpectationsMet, summaries },
  files,
};
writeFileSync(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ frozenAt: manifest.frozenAt, files: files.slice(0, 3), validation: manifest.validation }, null, 2));
