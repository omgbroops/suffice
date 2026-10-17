import { resolve } from 'node:path';
import { stateDir } from '../../src/runtime.mjs';

export const repository = 'https://github.com/npm/node-semver';
export const baseRevision = 'efa4be6096c1f9b77d9d27d6132f6220c43b4e31';
export const upstreamDir = resolve(stateDir, 'upstream/semver', `node-semver-${baseRevision}`);
export const realTasks = [
  {
    id: 'prerelease-subset',
    fix: '5f3ca133e040210b6ea80c350a1d61d9da02e722',
    referenceFile: 'ranges/subset.js',
    issue: 'https://github.com/npm/node-semver/issues/757',
    prompt: 'Fix subset() incorrectly rejecting contained prerelease ranges. For example, ^10.2.0-beta.2 should be a subset of ^10.2.0-beta.1. Preserve normal prerelease exclusion, inclusive/exclusive bound semantics, empty ranges, and existing options. Investigate both lower and upper bounds rather than special-casing this example.',
  },
  {
    id: 'build-metadata',
    fix: '17aa702d91166472b197a2ea768f085083bee2e4',
    referenceFile: 'classes/range.js',
    issue: 'https://github.com/npm/node-semver/pull/869',
    prompt: 'Fix range parsing with long build metadata. Build metadata must not change range meaning or bleed into version numbers. A loose range consisting of 4.17.0+ followed by 250 letters a and then 3 must mean exactly 4.17.0. The problem also affects comparator whitespace, partial versions, hyphen ranges, tilde/caret ranges and OR sets. Preserve prereleases and existing strict/loose behavior.',
  },
  {
    id: 'dotted-prerelease',
    fix: 'bea6028694a75e840f48b288ac019e9644cfe6e8',
    referenceFile: 'classes/semver.js',
    issue: 'https://github.com/npm/node-semver/issues/226',
    prompt: 'Fix incrementing prereleases when the requested identifier contains dots. inc(3.0.0-alpha.beta.5.4, prerelease, false, alpha.beta) should continue to 3.0.0-alpha.beta.5.5 rather than restart the sequence. A matching prefix followed by a nonnumeric segment must restart, and a mismatching prefix must be replaced. Preserve identifierBase options, invalid-identifier handling, single-component identifiers, and nonmutation of SemVer objects passed to the public inc function.',
  },
  { id: 'picomatch-142', repo: 'picomatch', issue: 'https://github.com/micromatch/picomatch', prompt: 'Fix picomatch so a pattern whose last element is a globstar inside a group, such as test(/utils/**) or test?(/utils/**), matches the parent path test/utils as well as paths below it. Keep the group semantics: a required group must not match the bare prefix, an optional group still may, strictSlashes still rejects a bare parent, and anything following the group still has to match.' },
  { id: 'picomatch-99', repo: 'picomatch', issue: 'https://github.com/micromatch/picomatch', prompt: 'Fix picomatch so that ** immediately followed by a literal in the same path segment, such as **.thing.js, behaves like a single * and cannot match across path separators: somepath/test.thing.js must not match **.thing.js, while test.thing.js still does. Do not change how **/ forms or bare ** segments behave.' },
  { id: 'picomatch-187', repo: 'picomatch', issue: 'https://github.com/micromatch/picomatch', prompt: 'Fix picomatch bracket negation: a leading ! (or ^) inside a bracket class such as [!abc] must negate the class, so isMatch("a", "[!abc]") is false and isMatch("d", "[!abc]") is true, with and without the posix option. Preserve escaped \\!, a non-leading ! as a literal, [!]] negating a closing bracket, an unterminated [!] staying literal, and the literalBrackets / nobracket options.' },
  { id: 'picomatch-202', repo: 'picomatch', issue: 'https://github.com/micromatch/picomatch', prompt: 'Fix picomatch so a globstar (**) matches paths that contain newline or carriage-return characters, e.g. isMatch("hello\\nworld", "**") should be true.' },
  { id: 'bytes-51', repo: 'bytes', issue: 'https://github.com/visionmedia/bytes.js/issues/51', prompt: 'Fix bytes formatting with the thousandsSeparator option: the separator must only group the integer part of the number. bytes(1234567.891234, {unit: "B", decimalPlaces: 6, thousandsSeparator: ","}) should give "1,234,567.891234B", not insert separators into the digits after the decimal point. Preserve grouping of the integer part (including negative numbers), fixedDecimals, decimalPlaces, unitSeparator, unit selection, a plain format with no thousandsSeparator, and parsing.' },
  { id: 'cookie-173', repo: 'cookie', issue: 'https://github.com/jshttp/cookie/issues/173', prompt: 'Fix the cookie package so serialize() accepts a Domain option with a single leading dot, as browsers and RFC 6265 allow: serialize("foo", "bar", { domain: ".example.com" }) should return "foo=bar; Domain=.example.com" instead of throwing. Preserve validation of everything else: a domain still must be made of valid labels (letters, digits, hyphens, no leading or trailing hyphen, at most 63 characters each) separated by single dots, and must still be rejected if it has a trailing dot, consecutive dots, more than one leading dot, spaces or other invalid characters. Domains without a leading dot, and the validation of other options, must behave as before.' },
  { id: 'shell-quote-15', repo: 'shell-quote', issue: 'https://github.com/ljharb/shell-quote/issues/15', prompt: 'Fix the shell-quote package so quote() output is correct when an argument contains backslashes together with spaces or double quotes. quote(["find /home -type f -name \\"*.json\\" -exec ls -l {} \\\\;"]) currently yields a string that, when the shell parses it, no longer gives back the original argument (the backslash before ; is doubled, so find reports "missing argument to -exec"). The quoted output must round-trip through sh to exactly the original argument. Preserve: arguments containing a single quote, quotes and other special characters ($, backticks, !) still being quoted so the shell returns them unchanged; plain words staying unquoted; backslash-escaping of shell operators and metacharacters such as > < ; { } | and $; empty strings; operator objects; and number/boolean/null/undefined arguments.' },
].map(t => ({ ...t, title: t.id, workspaceDir: resolve(stateDir, 'real-tasks', t.id, 'workspace'),
  acceptancePath: resolve(import.meta.dirname, `${t.id}.test.mjs`) }));
