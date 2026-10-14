import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { createRouter } = await import(pathToFileURL(resolve(workspace, 'src/index.mjs')).href);
test('exact and longest boundary prefixes override declaration order', () => {
  const router = createRouter({ defaults: {}, routes: [
    { id: 'fallback', pattern: '*', settings: {} },
    { id: 'app', pattern: '/app/*', settings: {} },
    { id: 'admin', pattern: '/app/admin/*', settings: {} },
    { id: 'exact', pattern: '/app/admin/user', settings: {} },
  ] });
  assert.equal(router.resolve('t', '/app/admin/user').route, 'exact');
  assert.equal(router.resolve('t', '/app/admin/other').route, 'admin');
  assert.equal(router.resolve('t', '/app').route, 'app');
  assert.equal(router.resolve('t', '/apple').route, 'fallback');
  assert.equal(router.resolve('t', '/APP').route, 'fallback');
  const tied = createRouter({ defaults: {}, routes: [{ id: 'one', pattern: '/x/*', settings: {} }, { id: 'two', pattern: '/x/*', settings: {} }] });
  assert.equal(tied.resolve('t', '/x/a').route, 'one');
});
test('explicit falsy fields and header deletion compose across layers', () => {
  const router = createRouter({
    defaults: { enabled: true, timeout: 25, label: 'default', headers: { a: 'default', b: 'default', c: 'default' } },
    routes: [{ id: 'app', pattern: '/app', settings: { timeout: 0, label: '', headers: { a: null, b: 'route' } } }],
  });
  router.setTenant('red', { enabled: false, headers: { b: null, c: '', d: 'tenant' } });
  assert.deepEqual(router.resolve('red', '/app'), { enabled: false, timeout: 0, label: '', headers: { c: '', d: 'tenant' }, route: 'app' });
});
test('cache is tenant and revision scoped including replaced and absent matches', () => {
  const router = createRouter({ defaults: { target: 'default' }, routes: [{ id: 'app', pattern: '/app', settings: {} }] });
  router.setTenant('red', { target: 'red' }); router.setTenant('blue', { target: 'blue' });
  assert.equal(router.resolve('red', '/app').target, 'red');
  assert.equal(router.resolve('blue', '/app').target, 'blue');
  router.setTenant('red', { target: 'new' });
  assert.equal(router.resolve('red', '/app').target, 'new');
  assert.equal(router.resolve('blue', '/app').target, 'blue');
  router.setTenant('red', {});
  assert.equal(router.resolve('red', '/app').target, 'default');
  assert.equal(router.resolve('red', '/missing'), null);
});
test('constructor and update inputs plus nested resolve results are snapshots', () => {
  const input = { defaults: { headers: { x: 'one' } }, routes: [{ id: 'app', pattern: '/app', settings: {} }] };
  const router = createRouter(input); input.defaults.headers.x = 'bad'; input.routes[0].id = 'bad';
  const override = { headers: { y: 'two' } }; router.setTenant('red', override); override.headers.y = 'bad';
  const first = router.resolve('red', '/app'); first.headers.x = 'bad';
  assert.deepEqual(router.resolve('red', '/app'), { headers: { x: 'one', y: 'two' }, route: 'app' });
});
}
