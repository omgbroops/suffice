import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const ipaddr = require('./lib/ipaddr.js');
// Adapted from whitequark/ipaddr.js 2.2.0: isValidCIDR and updated ranges.
test('IPv4.isValidCIDR validates CIDR notation', () => {
  assert.equal(ipaddr.IPv4.isValidCIDR('1.2.3.0/24'), true);
  assert.equal(ipaddr.IPv4.isValidCIDR('10.0.0.0/8'), true);
  assert.equal(ipaddr.IPv4.isValidCIDR('1.2.3.0/33'), false);
  assert.equal(ipaddr.IPv4.isValidCIDR('1.2.3.300/24'), false);
  assert.equal(ipaddr.IPv4.isValidCIDR('not-an-ip/24'), false);
});
test('IPv6.isValidCIDR validates CIDR notation and rejects non-v6', () => {
  assert.equal(ipaddr.IPv6.isValidCIDR('::1/128'), true);
  assert.equal(ipaddr.IPv6.isValidCIDR('2001:db8::/32'), true);
  assert.equal(ipaddr.IPv6.isValidCIDR('::1/129'), false);
  assert.equal(ipaddr.IPv6.isValidCIDR('1.2.3.4/24'), false);
});
test('new special-purpose ranges are classified', () => {
  assert.equal(new ipaddr.IPv4([192, 175, 48, 1]).range(), 'as112');
  assert.equal(new ipaddr.IPv4([192, 31, 196, 1]).range(), 'as112');
  assert.equal(new ipaddr.IPv4([192, 52, 193, 1]).range(), 'amt');
  assert.equal(new ipaddr.IPv6([0x100, 0, 0, 0, 0, 0, 0, 0]).range(), 'discard');
  assert.equal(new ipaddr.IPv6([0x2001, 0x100, 0, 0, 0, 0, 0, 0]).range(), 'reserved');
  assert.equal(new ipaddr.IPv6([0x2001, 0x30, 0, 0, 0, 0, 0, 0]).range(), 'droneRemoteIdProtocolEntityTags');
  assert.equal(new ipaddr.IPv4([8, 8, 8, 8]).range(), 'unicast');
});
