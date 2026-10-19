import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const entry = path.join(process.cwd(), 'lib/main.js');
const namespace = await import(pathToFileURL(entry).href);
const cjs = createRequire(import.meta.url)(entry);
const directory = fs.mkdtempSync(path.join(process.cwd(), '.broad-acceptance/env-'));
const key = 'SUFFICE_PUBLIC_EXPORT_CONTRACT';
const before = process.env[key];
try {
  assert.equal(typeof namespace.config, 'function', 'namespace import exposes config');
  assert.equal(typeof namespace.parse, 'function', 'namespace import preserves parse');
  assert.equal(typeof namespace.default.config, 'function', 'default import compatibility');
  assert.equal(typeof cjs.config, 'function', 'CommonJS compatibility');
  assert.deepEqual(namespace.parse(Buffer.from('NUMBER=42\nEMPTY=\n')), {NUMBER: '42', EMPTY: ''});
  const fixture = path.join(directory, 'custom.env');
  fs.writeFileSync(fixture, `${key}=loaded-through-esm\n`, 'utf8');
  delete process.env[key];
  const result = namespace.config({path: fixture});
  assert.equal(result.error, undefined);
  assert.equal(result.parsed[key], 'loaded-through-esm');
  assert.equal(process.env[key], 'loaded-through-esm');
  const failure = namespace.config({path: path.join(directory, 'missing.env')});
  assert.ok(failure.error, 'config still returns failed read as an error result');
  console.log('namespace config/parse, default/CommonJS imports, custom file and error-return compatibility passed');
} finally {
  if (before === undefined) delete process.env[key];
  else process.env[key] = before;
  fs.rmSync(directory, {recursive: true, force: true});
}
