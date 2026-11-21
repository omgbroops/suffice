import { resolve } from 'node:path';
import { stateDir } from '../../src/runtime.mjs';

// Long suite: multi-part real-OSS repairs. Wider version spans and prompts
// that require every upstream fix, so runs take more turns than the
// real-hard suite.
export const longTasks = [
  { id: 'qs-611-long', pkg: 'qs', base: '6.11.2', fix: '6.14.0', issue: 'https://github.com/ljharb/qs',
    prompt: `Fix the qs package (src/) to match the 6.14.0 release behavior. All of these must hold:
1. parse: a throwOnLimitExceeded option. When true, exceeding parameterLimit throws RangeError "Parameter limit exceeded. Only N parameters allowed." and exceeding arrayLimit throws "Array limit exceeded. Only N elements allowed in an array." When false/absent, limits truncate silently as before.
2. parse: a duplicates option — 'combine' (default, arrays) or 'last' (later value wins, e.g. a=1&a=2 -> {a:'2'}).
3. parse: a decodeDotInKeys option — keys containing %2E or . decode into nested objects (a.b=x -> {a:{b:'x'}}).
4. parse: an allowEmptyArrays option — a[]= produces [] when true.
5. parse: a strictDepth option — throws RangeError when nesting exceeds depth.
6. utils.merge: a function as the source argument merges its own enumerable props like an object instead of being stringified into a key name.` },
  { id: 'cookie-050-long', pkg: 'cookie', base: '0.5.0', fix: '0.7.2', issue: 'https://github.com/jshttp/cookie',
    prompt: `Fix the cookie package (src/) to match the 0.7.2 release behavior. All of these must hold:
1. parse must survive a cookie whose name shadows inherited Object.prototype members: parse("hasOwnProperty=x; a=1; b=2") returns all three pairs instead of throwing.
2. serialize must validate its inputs per RFC 6265: an invalid cookie name (e.g. containing a space) throws TypeError "argument name is invalid", an invalid domain (e.g. "bad_domain-.com") throws "option domain is invalid", an invalid expires date throws, and an invalid path throws. Valid names, values, domains, expires and paths must serialize exactly as before.` },
  { id: 'express-417-long', pkg: 'express', base: '4.17.3', fix: '4.21.2', issue: 'https://github.com/expressjs/express',
    prompt: `Fix the express package (src/lib/response.js and related files) to match the 4.21.2 release behavior. All of these must hold:
1. res.location(url) must percent-encode the complete URL with encodeUrl instead of leaving the scheme://host prefix unencoded via a regexp match (res.location("http://ho st.com/x") must yield "http://ho%20st.com/x", not "http://ho st.com/x").
2. res.redirect's default HTML body must no longer wrap the target in an anchor tag: it produces '<p>Found. Redirecting to http://x/y</p>' (plain text URL), not '<a href="...">...</a>'.` },
  { id: 'ipaddr-220', pkg: 'ipaddr.js', base: '2.1.0', fix: '2.2.0', issue: 'https://github.com/whitequark/ipaddr.js',
    prompt: 'Fix the ipaddr package: add IPv4.isValidCIDR(string) and IPv6.isValidCIDR(string) returning whether the string is valid CIDR notation (IPv6.isValidCIDR must reject strings without a colon). Also update the special-purpose ranges: IPv4 192.175.48.0/24 and 192.31.196.0/24 are "as112", 192.52.193.0/24 is "amt"; IPv6 100::/64 is "discard" and the "reserved" range is 2001::/23 (which also covers documentation 2001:db8::/32), with 2001:30::/28 as "droneRemoteIdProtocolEntityTags" and an extra as112v6 range 2620:4f:8000::/48.' },
  { id: 'negotiator-064', pkg: 'negotiator', base: '0.6.3', fix: '0.6.4', issue: 'https://github.com/jshttp/negotiator',
    prompt: 'Fix the negotiator package so encodings() accepts an optional third argument: a preferred ordering of encodings. After quality sorting, entries appearing in the preferred list must come first in the preferred order; entries not in it keep specifity/order rules as the fallback. With no third argument, behavior must be unchanged. encoding() must accept and forward the same preferred argument.' },
  { id: 'shell-quote-183', pkg: 'shell-quote', base: '1.8.1', fix: '1.8.3', issue: 'https://github.com/ljharb/shell-quote',
    prompt: "Fix the shell-quote quote() function. Two defects: an empty-string argument yields an empty output instead of a quoted '' (quote(['']) must be \"''\", and quote(['x','']) must be \"x ''\"); and an argument containing a backslash is not quoted even though it needs to be (quote(['a\\\\b']) must be \"'a\\\\b'\", quote(['a b\\\\c']) must be \"'a b\\\\c'\", with the backslash left unescaped inside the single quotes). Quoting for spaces, double quotes, single quotes and other specials must stay exactly as it is." },
  { id: 'path-to-regexp-820', pkg: 'path-to-regexp', base: '8.0.0', fix: '8.2.0', issue: 'https://github.com/pillarjs/path-to-regexp',
    prompt: 'Fix the path-to-regexp package so wildcard parameters match segments containing newlines: match("/files/*rest")("/files/a\\nb") must succeed (wildcard params collect into an array). Also export a stringify(tokenData) function that serializes parse() output back to a path string, escaping reserved characters in literal text. Regular params and the rest of the API must behave as before.' },
].map(t => ({ ...t, title: t.id, workspaceDir: resolve(stateDir, 'real-tasks', t.id, 'workspace'),
  acceptancePath: resolve(import.meta.dirname, `${t.id}.test.mjs`) }));
