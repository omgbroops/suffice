import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const {parse} = createRequire(import.meta.url)(path.join(process.cwd(), 'lib/main.js'));

for (const newline of ['\n', '\r\n']) {
  const json = '{"field1":"some value", "field2": "stops here#this is retained"}';
  const nested = '{"nested":{"url":"https://example.invalid/#section","ok":true}}';
  const input = [
    `OBJECT=${json}`,
    `NESTED=${nested}`,
    'HASH_VALUE=token#fragment',
    'COMMENT=retained # removed',
    'TAB_COMMENT=retained\t# removed',
    'DOUBLE="a # quoted hash" # comment',
    "SINGLE='b # quoted hash' # comment",
    '# standalone comment',
    'EMPTY=',
    'TRIM=  trimmed  ',
    'DUP=first',
    'DUP=last'
  ].join(newline);
  const result = parse(Buffer.from(input));
  assert.equal(result.OBJECT, json, 'JSON with a hash retains the complete string');
  assert.deepEqual(JSON.parse(result.OBJECT), JSON.parse(json));
  assert.equal(result.NESTED, nested);
  assert.equal(result.HASH_VALUE, 'token#fragment');
  assert.equal(result.COMMENT, 'retained');
  assert.equal(result.TAB_COMMENT, 'retained');
  assert.equal(result.DOUBLE, 'a # quoted hash');
  assert.equal(result.SINGLE, 'b # quoted hash');
  assert.equal(result.EMPTY, '');
  assert.equal(result.TRIM, 'trimmed');
  assert.equal(result.DUP, 'last');
  assert.equal(Object.keys(result).length, 10);
}
console.log('JSON/hash retention and existing comment, quoting, whitespace and newline contracts passed');
