// Standalone, dependency-free evaluator. Expected values are frozen literals
// and contract-derived vectors, validated against the two pinned fixes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'

const [task, workspace, ...extra] = process.argv.slice(2)
if (!['build-metadata', 'prerelease-subset'].includes(task) || !workspace || extra.length) {
  console.error('Usage: node grade-semver.mjs <build-metadata|prerelease-subset> <workspace>')
  process.exit(2)
}
const require = createRequire(import.meta.url)
let semver
try {
  semver = require(path.resolve(workspace, 'src/index.js'))
} catch (error) {
  console.error(`Cannot load workspace/src/index.js: ${error.stack || error}`)
  process.exit(2)
}

const tests = []
const test = (name, run) => tests.push({ name, run })
const subset = (name, sub, dom, expected, options) => test(name, () => {
  assert.equal(semver.subset(sub, dom, options), expected,
    `${JSON.stringify(sub)} subset ${JSON.stringify(dom)}; options=${JSON.stringify(options)}`)
})
const satisfies = (name, version, range, expected, options) => test(name, () => {
  assert.equal(semver.satisfies(version, range, options), expected,
    `${JSON.stringify(version)} satisfies ${JSON.stringify(range)}`)
})

function prereleaseSubsetSuite () {
  subset('public caret prerelease containment', '^10.2.0-beta.2', '^10.2.0-beta.1', true)
  for (const tuple of ['1.2.3']) {
    const major = Number(tuple.split('.')[0])
    const top = `${major + 1}.0.0-0`
    const pre = `${tuple}-beta`
    subset(`${tuple}: caret contained prerelease`, `^${pre}.2`, `^${pre}.1`, true)
    subset(`${tuple}: reverse caret escapes lower bound`, `^${pre}.1`, `^${pre}.2`, false)
    subset(`${tuple}: inclusive lower prerelease with unrelated upper tuple`,
      `>=${pre}.2 <${top}`, `>=${pre}.1 <${top}`, true)
    subset(`${tuple}: lower prerelease with stable upper comparator`,
      `>=${pre}.2 <${major + 1}.0.0`, `>=${pre}.1 <${major + 1}.0.0`, true)
    subset(`${tuple}: exclusive lower contained in inclusive domain`,
      `>${pre}.2 <${top}`, `>=${pre}.2 <${top}`, true)
    subset(`${tuple}: inclusive lower is not contained in exclusive domain`,
      `>=${pre}.2 <${top}`, `>${pre}.2 <${top}`, false)
    subset(`${tuple}: inclusive upper prerelease with stable lower comparator`,
      `>=0.0.0 <=${pre}.2`, `>=0.0.0 <=${pre}.3`, true)
    subset(`${tuple}: exclusive upper contained in inclusive domain`,
      `>=0.0.0 <${pre}.2`, `>=0.0.0 <=${pre}.2`, true)
    subset(`${tuple}: inclusive upper is not contained in exclusive domain`,
      `>=0.0.0 <=${pre}.2`, `>=0.0.0 <${pre}.2`, false)
    subset(`${tuple}: upper boundary escapes domain`,
      `>=0.0.0 <=${pre}.3`, `>=0.0.0 <=${pre}.2`, false)
    subset(`${tuple}: lower prerelease needs matching domain tuple`,
      `>=${pre}.2 <${top}`, `>=0.0.0 <${top}`, false)
    subset(`${tuple}: upper prerelease needs matching domain tuple`,
      `>=0.0.0 <=${pre}.2`, `>=0.0.0 <${top}`, false)
    subset(`${tuple}: includePrerelease permits lower tuple without a gate`,
      `>=${pre}.2 <${top}`, `>=0.0.0 <${top}`, true, { includePrerelease: true })
    subset(`${tuple}: includePrerelease permits upper tuple without a gate`,
      `>=0.0.0 <=${pre}.2`, `>=0.0.0 <${top}`, true, { includePrerelease: true })
  }

  const cases = [
    ['zero major caret prerelease containment', '^0.0.4-beta.2', '^0.0.4-beta.1', true],
    ['zero major reverse caret escapes lower bound', '^0.0.4-beta.1', '^0.0.4-beta.2', false],
    ['both inclusive prerelease bounds at different tuples',
      '>=1.2.3-beta.2 <=1.3.0-rc.2', '>=1.2.3-beta.1 <=1.3.0-rc.3', true],
    ['both bounds: lower escapes',
      '>=1.2.3-beta.0 <=1.3.0-rc.2', '>=1.2.3-beta.1 <=1.3.0-rc.3', false],
    ['both bounds: upper escapes',
      '>=1.2.3-beta.2 <=1.3.0-rc.4', '>=1.2.3-beta.1 <=1.3.0-rc.3', false],
    ['upper domain comparator supplies the lower prerelease gate',
      '>=1.2.3-beta.2 <=1.2.3-beta.8', '>=1.0.0 <=1.2.3-beta.9', true],
    ['lower domain comparator supplies the upper prerelease gate',
      '>=1.2.3-beta.2 <=1.2.3-beta.8', '>=1.2.3-beta.1 <2.0.0', true],
    ['two prerelease tuple gates cannot substitute for a third tuple',
      '>=1.2.4-beta.2 <=1.3.0-rc.2', '>=1.2.3-beta.1 <=1.3.0-rc.3', false],
    ['numeric prerelease identifiers compare numerically',
      '>=1.2.3-beta.10 <2.0.0', '>=1.2.3-beta.2 <2.0.0', true],
    ['numeric prerelease ordering reverse is excluded',
      '>=1.2.3-beta.2 <2.0.0', '>=1.2.3-beta.10 <2.0.0', false],
    ['string prerelease ordering and compound identifiers',
      '>=1.2.3-rc.1.build-a <2.0.0', '>=1.2.3-beta.9 <2.0.0', true],
    ['build metadata does not change prerelease lower bounds',
      '>=1.2.3-beta.2+sub.1 <2.0.0', '>=1.2.3-beta.1+dom.2 <2.0.0', true],
    ['dominated subset lower bounds are reduced',
      '>=1.2.3-beta.1 >=1.2.3-beta.2 <2.0.0', '>=1.2.3-beta.1 <3.0.0', true],
    ['dominated subset upper bounds are reduced',
      '>=1.0.0 <=1.2.3-beta.3 <=1.2.3-beta.2', '>=0.5.0 <=1.2.3-beta.4', true],
    ['extra domain lower comparator still enforces boundary',
      '>=1.2.3-beta.2 <2.0.0', '>=1.0.0 >=1.2.3-beta.3 <2.0.0', false],
    ['extra domain upper comparator still enforces boundary',
      '>=1.0.0 <=1.2.3-beta.3', '>=0.5.0 <=1.2.3-beta.2 <2.0.0', false],
    ['tilde prerelease containment', '~1.2.3-beta.2', '~1.2.3-beta.1', true],
    ['hyphen prerelease bounds',
      '1.2.3-beta.2 - 1.3.0-rc.2', '1.2.3-beta.1 - 1.3.0-rc.3', true],
    ['exclusive zero prerelease upper bound needs no tuple gate',
      '>=1.0.0 <2.0.0-0', '>=1.0.0 <2.0.0', true],
    ['nonzero prerelease upper bound needs its tuple gate',
      '>=1.0.0 <2.0.0-1', '>=1.0.0 <2.0.0', false],
    ['inclusive zero prerelease upper bound still needs tuple gate',
      '>=1.0.0 <=2.0.0-0', '>=1.0.0 <2.0.0', false],
    ['stable lower boundary cannot admit earlier prereleases',
      '>=1.2.3-beta.2 <2.0.0', '>=1.2.3 <2.0.0', false],
    ['ordinary stable interval containment', '>=1.2.3 <1.3.0', '^1.0.0', true],
    ['ordinary stable interval escapes upper boundary', '>=1.2.3 <=2.0.0', '^1.0.0', false],
    ['ordinary exclusive lower boundary', '>=1.2.3 <2.0.0', '>1.2.3 <2.0.0', false],
    ['ordinary exclusive upper boundary', '>=1.2.3 <=2.0.0', '>=1.2.3 <2.0.0', false],
    ['ordinary exact version in a stable interval', '1.2.3', '^1.0.0', true],
    ['exact prerelease excluded by ordinary interval', '1.2.3-beta.2', '^1.0.0', false],
    ['identical exact prerelease range', '1.2.3-beta.2', '1.2.3-beta.2', true],
    ['same-tuple singleton interval with inclusive bounds',
      '>=1.2.3-beta.2 <=1.2.3-beta.2', '>=1.2.3-beta.1 <2.0.0', true],
    ['stable singleton interval in exact domain', '>=1.2.3 <=1.2.3', '1.2.3', true],
    ['impossible prerelease lower and upper bounds are empty',
      '>1.2.3-beta.3 <1.2.3-beta.2', '9.9.9', true],
    ['equal bounds with exclusive lower are empty',
      '>1.2.3-beta.2 <=1.2.3-beta.2', '9.9.9', true],
    ['equal bounds with exclusive upper are empty',
      '>=1.2.3-beta.2 <1.2.3-beta.2', '9.9.9', true],
    ['multiple distinct equality comparators form empty set', '1.2.3 2.0.0', '9.9.9', true],
    ['contradictory stable bounds are empty in prerelease domain', '>=2.0.0 <1.0.0', '^1.2.3-beta.1', true],
    ['nonempty prerelease interval is not subset of empty set', '^1.2.3-beta.2', '<0.0.0-0', false],
    ['empty string is the ordinary any range', '', '*', true],
    ['ordinary any is not a bounded interval', '', '^1.0.0', false],
    ['ordinary any still excludes prereleases', '^1.2.3-beta.2', '*', false],
    ['ordinary stable range is subset of any', '^1.2.3', '*', true],
    ['OR alternatives independently contained',
      '^1.2.3-beta.2 || ^2.0.0-rc.2', '^1.2.3-beta.1 || ^2.0.0-rc.1', true],
    ['OR alternative escapes its domain',
      '^1.2.3-beta.2 || ^2.0.0-rc.0', '^1.2.3-beta.1 || ^2.0.0-rc.1', false],
    ['subset may match a later OR domain', '^2.0.0-rc.2', '^1.2.3-beta.1 || ^2.0.0-rc.1', true],
    ['canonical empty OR branch is ignored',
      '<0.0.0-0 || ^1.2.3-beta.2', '^1.2.3-beta.1', true],
  ]
  for (const [name, sub, dom, expected] of cases) subset(name, sub, dom, expected)
  subset('includePrerelease any accepts prerelease intervals', '^1.2.3-beta.2', '*', true,
    { includePrerelease: true })
  subset('includePrerelease keeps lower exclusivity',
    '>=1.2.3-beta.2 <2.0.0', '>1.2.3-beta.2 <2.0.0', false, { includePrerelease: true })
  subset('includePrerelease keeps upper exclusivity',
    '>=1.0.0 <=1.2.3-beta.2', '>=1.0.0 <1.2.3-beta.2', false, { includePrerelease: true })
  subset('loose option accepts zero padded prerelease tuple',
    '>=01.02.03-beta.2 <2.0.0', '>=01.02.03-beta.1 <2.0.0', true, { loose: true })
  subset('loose option and includePrerelease combine',
    '>=01.02.03-beta.2 <2.0.0', '>=01.0.0 <2.0.0', true,
    { loose: true, includePrerelease: true })
  test('strict subset rejects zero padded versions', () => {
    assert.throws(() => semver.subset('>=01.02.03-beta.2 <2.0.0', '^1.0.0'), TypeError)
  })
  test('invalid subset input still throws', () => {
    assert.throws(() => semver.subset('definitely-invalid', '^1.0.0'), TypeError)
    assert.throws(() => semver.subset('^1.0.0', 'definitely-invalid'), TypeError)
  })
  test('Range instances work as subset inputs', () => {
    assert.equal(semver.subset(new semver.Range('^1.2.3-beta.2'),
      new semver.Range('^1.2.3-beta.1')), true)
  })
  for (const [version, range, expected, options] of [
    ['1.2.3-beta.2', '^1.0.0', false],
    ['1.2.3-beta.2', '^1.2.3-beta.1', true],
    ['1.2.4-beta.2', '^1.2.3-beta.1', false],
    ['1.2.4-beta.2', '^1.2.3-beta.1', true, { includePrerelease: true }],
    ['2.0.0', '^1.2.3-beta.1', false],
  ]) satisfies(`prerelease satisfaction regression: ${version} in ${range}; ${JSON.stringify(options)}`,
    version, range, expected, options)
}

function buildMetadataSuite () {
  // Each row has a decorated input template, a literal canonical range, and
  // explicit membership vectors. No actor-generated result is an oracle.
  const rows = [
    ['exact', b => `4.17.0+${b}`, '4.17.0',
      ['4.17.0', '4.17.0+different.7'], ['4.17.3', '4.17.1', '4.16.9', '4.17.0-beta.1']],
    ['spaced equality comparator', b => `= \t 4.17.0+${b}`, '4.17.0',
      ['4.17.0'], ['4.17.3', '4.18.0']],
    ['spaced comparator intersection', b => ` >= \t 4.17.0+${b}\n <  5.0.0+${b} `, '>=4.17.0 <5.0.0',
      ['4.17.0', '4.99.9'], ['4.16.9', '5.0.0', '4.18.0-beta.1']],
    ['exclusive comparator intersection', b => `>4.17.0+${b} <=4.18.0+${b}`, '>4.17.0 <=4.18.0',
      ['4.17.1', '4.18.0'], ['4.17.0', '4.18.1']],
    ['partial minor', b => `4.17+${b}`, '>=4.17.0 <4.18.0-0',
      ['4.17.0', '4.17.999'], ['4.16.9', '4.18.0', '4.17.1-beta.1']],
    ['partial major', b => `4+${b}`, '>=4.0.0 <5.0.0-0',
      ['4.0.0', '4.99.999'], ['3.99.0', '5.0.0']],
    ['x patch', b => `4.17.x+${b}`, '>=4.17.0 <4.18.0-0',
      ['4.17.0', '4.17.3'], ['4.18.0', '4.16.9']],
    ['partial exclusive lower', b => `> 4.17+${b}`, '>=4.18.0',
      ['4.18.0', '5.0.0'], ['4.17.999', '4.18.0-beta.1']],
    ['partial inclusive upper', b => `<= 4.17+${b}`, '<4.18.0-0',
      ['0.0.0', '4.17.999'], ['4.18.0', '4.18.0-beta.1']],
    ['hyphen full endpoints', b => `4.17.0+${b} - 4.18.0+${b}`, '>=4.17.0 <=4.18.0',
      ['4.17.0', '4.18.0'], ['4.16.9', '4.18.1', '4.18.0-beta.1']],
    ['hyphen partial endpoints', b => `4.17+${b} - 5+${b}`, '>=4.17.0 <6.0.0-0',
      ['4.17.0', '5.99.9'], ['4.16.9', '6.0.0']],
    ['hyphen prerelease endpoints', b => `1.2.3-beta.2+${b} - 1.2.3-beta.8+${b}`,
      '>=1.2.3-beta.2 <=1.2.3-beta.8', ['1.2.3-beta.2', '1.2.3-beta.7', '1.2.3-beta.8'],
      ['1.2.3-beta.1', '1.2.3-beta.9', '1.2.3', '1.2.4-beta.1']],
    ['spaced tilde', b => `~ \t4.17.0+${b}`, '>=4.17.0 <4.18.0-0',
      ['4.17.0', '4.17.999'], ['4.16.9', '4.18.0']],
    ['tilde partial', b => `~4.17+${b}`, '>=4.17.0 <4.18.0-0',
      ['4.17.0', '4.17.3'], ['4.18.0']],
    ['spaced caret', b => `^ \t4.17.0+${b}`, '>=4.17.0 <5.0.0-0',
      ['4.17.0', '4.99.9'], ['4.16.9', '5.0.0']],
    ['caret zero major', b => `^0.2.3+${b}`, '>=0.2.3 <0.3.0-0',
      ['0.2.3', '0.2.9'], ['0.2.2', '0.3.0']],
    ['caret zero minor', b => `^0.0.3+${b}`, '>=0.0.3 <0.0.4-0',
      ['0.0.3'], ['0.0.2', '0.0.4']],
    ['caret prerelease', b => `^1.2.3-beta.2+${b}`, '>=1.2.3-beta.2 <2.0.0-0',
      ['1.2.3-beta.2', '1.2.3-beta.3', '1.2.3', '1.9.9'],
      ['1.2.3-beta.1', '1.2.4-beta.1', '2.0.0']],
    ['exact prerelease', b => `4.17.0-beta.2+${b}`, '4.17.0-beta.2',
      ['4.17.0-beta.2', '4.17.0-beta.2+other.3'], ['4.17.0-beta.3', '4.17.0', '4.17.3']],
    ['OR exact versions', b => `4.17.0+${b} || 5.1.2+${b}`, '4.17.0||5.1.2',
      ['4.17.0', '5.1.2'], ['4.17.3', '4.99.0', '5.1.3']],
    ['OR shorthand and prerelease', b => `~4.17+${b} || ^5.1.2-beta.1+${b}`,
      '>=4.17.0 <4.18.0-0||>=5.1.2-beta.1 <6.0.0-0', ['4.17.2', '5.1.2-beta.2', '5.9.0'],
      ['4.18.0', '5.1.2-beta.0', '5.1.3-beta.1', '6.0.0']],
  ]
  const payloads = [
    ['strict short metadata', 'build.009.alpha-7', { loose: false }],
    ['loose public length 251 numeric tail', 'a'.repeat(250) + '3', { loose: true }],
  ]
  for (const [payloadName, payload, options] of payloads) {
    for (const [name, make, expected, yes, no] of rows) {
      const range = make(payload)
      test(`${name}: ${payloadName}: normalization and membership`, () => {
        assert.equal(semver.validRange(range, options), expected)
        assert.equal(new semver.Range(range, options).range, expected)
        const compiled = new semver.Range(range, options)
        for (const [versions, expectedMatch] of [[yes, true], [no, false]]) {
          for (const version of versions) {
            assert.equal(compiled.test(version), expectedMatch, `Range.test(${version})`)
            assert.equal(semver.satisfies(version, range, options), expectedMatch, `satisfies(${version})`)
          }
        }
      })
    }
  }
  for (const length of [1, 249, 250, 251, 252, 512, 2048]) {
    const payload = 'a'.repeat(length - 1) + '3'
    test(`metadata length ${length}: no numeric tail leaks into patch`, () => {
      assert.equal(semver.validRange(`4.17.0+${payload}`, { loose: true }), '4.17.0')
      assert.equal(semver.satisfies('4.17.3', `4.17.0+${payload}`, { loose: true }), false)
    })
  }
  for (const [name, payload] of [
    ['long numeric metadata', '7'.repeat(300) + '9'],
    ['long multi-identifier metadata', 'build.' + 'z-'.repeat(180) + '7.009.alpha-3'],
  ]) {
    test(`${name}: exact, shorthand, hyphen, and OR normalization`, () => {
      const options = { loose: true }
      assert.equal(semver.validRange(`4.17.0+${payload}`, options), '4.17.0')
      assert.equal(semver.validRange(`^4.17.0+${payload}`, options), '>=4.17.0 <5.0.0-0')
      assert.equal(semver.validRange(`4.17.0+${payload} - 4.18.0+${payload}`, options), '>=4.17.0 <=4.18.0')
      assert.equal(semver.validRange(`4.17.0+${payload} || 5.0.0+${payload}`, options), '4.17.0||5.0.0')
    })
  }
  // This strict-range expectation was checked directly against the pinned
  // range fix. SemVer version parsing retains its separate 256-character cap.
  test('strict range accepts the validated public long metadata form', () => {
    assert.equal(semver.validRange('4.17.0+' + 'a'.repeat(250) + '3', { loose: false }), '4.17.0')
  })
  for (const loose of [false, true]) {
    test(`version length cap is preserved; loose=${loose}`, () => {
      const version = '4.17.0+' + 'a'.repeat(250) + '3'
      assert.equal(semver.valid(version, { loose }), null)
      assert.equal(semver.parse(version, { loose }), null)
      assert.throws(() => new semver.SemVer(version, { loose }), TypeError)
    })
  }
  const long = 'a'.repeat(250) + '3'
  test('includePrerelease affects membership without altering metadata stripping', () => {
    const range = `4.17+${long}`
    assert.equal(semver.validRange(range, { loose: true, includePrerelease: true }), '>=4.17.0-0 <4.18.0-0')
    assert.equal(semver.satisfies('4.17.0-alpha', range, { loose: true, includePrerelease: true }), true)
    assert.equal(semver.satisfies('4.17.1-alpha', range, { loose: true, includePrerelease: true }), true)
    assert.equal(semver.satisfies('4.18.0-alpha', range, { loose: true, includePrerelease: true }), false)
    assert.equal(semver.satisfies('4.17.1-alpha', range, { loose: true }), false)
  })
  test('range parse cache respects strict loose and includePrerelease options', () => {
    const range = `01.02+${long}`
    assert.equal(semver.validRange(range), null)
    assert.equal(semver.validRange(range, true), '>=1.2.0 <1.3.0-0')
    assert.equal(semver.validRange(range, { loose: true, includePrerelease: true }), '>=1.2.0-0 <1.3.0-0')
    assert.equal(semver.validRange(range), null)
    assert.equal(semver.validRange(range, true), '>=1.2.0 <1.3.0-0')
  })
  test('loose prerelease spelling remains supported', () => {
    const range = `1.2.3beta.2+${long}`
    assert.equal(semver.validRange(range), null)
    assert.equal(semver.validRange(range, { loose: true }), '1.2.3-beta.2')
  })
  test('invalid range grammar remains invalid in strict mode', () => {
    for (const range of ['1.2.3+', '1.2.3+?', '1.2.3+foo_bar', '1.2.3.4+build', 'not-a-range']) {
      assert.equal(semver.validRange(range), null, range)
      assert.throws(() => new semver.Range(range), TypeError)
    }
  })
  test('short metadata leaves SemVer prerelease and build fields intact', () => {
    const version = new semver.SemVer('1.2.3-beta.2+build.009-alpha')
    assert.equal(version.version, '1.2.3-beta.2')
    assert.deepEqual(version.prerelease, ['beta', 2])
    assert.deepEqual(version.build, ['build', '009-alpha'])
    assert.equal(semver.compare('1.2.3+build.1', '1.2.3+build.2'), 0)
  })
  test('metadata is ignored on every comparator, not only the first', () => {
    const input = `>=1.2.3+${long} <2.0.0+${'b'.repeat(400)} || 3.0.0+${long}`
    assert.deepEqual(semver.toComparators(input, { loose: true }), [['>=1.2.3', '<2.0.0'], ['3.0.0']])
  })
  test('downstream minVersion and maxSatisfying see original tuple', () => {
    const range = `4.17.0+${long}`
    assert.equal(semver.minVersion(range, { loose: true }).version, '4.17.0')
    assert.equal(semver.maxSatisfying(['4.17.3', '4.17.0', '4.17.1'], range, { loose: true }), '4.17.0')
  })
  test('downstream intersection keeps exclusive and inclusive endpoints', () => {
    assert.equal(semver.intersects(`>=4.17.0+${long} <5.0.0+${long}`, '4.17.0', { loose: true }), true)
    assert.equal(semver.intersects(`>=4.17.0+${long} <5.0.0+${long}`, '5.0.0', { loose: true }), false)
  })
  subset('decorated exact range subset of undecorated exact range', `4.17.0+${long}`, '4.17.0', true, { loose: true })
  subset('undecorated exact range subset of decorated exact range', '4.17.0', `4.17.0+${long}`, true, { loose: true })
  satisfies('ordinary range regression matches', '1.2.3', '^1.0.0', true)
  satisfies('ordinary range regression rejects next major', '2.0.0', '^1.0.0', false)
  satisfies('ordinary prerelease exclusion remains', '1.2.3-beta.1', '^1.0.0', false)
}

if (task === 'prerelease-subset') prereleaseSubsetSuite()
else buildMetadataSuite()
let passed = 0
let failed = 0
for (const { name, run } of tests) {
  try {
    run()
    passed++
    console.log(`ok ${passed + failed} - ${name}`)
  } catch (error) {
    failed++
    console.log(`not ok ${passed + failed} - ${name}`)
    console.log(String(error.stack || error))
  }
}
console.log(JSON.stringify({ task, total: tests.length, passed, failed }))
process.exitCode = failed ? 1 : 0
