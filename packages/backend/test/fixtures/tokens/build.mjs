// Regenerates runs.json: node packages/backend/test/fixtures/tokens/build.mjs
// Shapes follow real MCP servers (GitHub, filesystem, Postgres, Playwright, Slack) and real tool output formats. Content is synthetic and seeded.
import fs from 'node:fs';

let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// [name, description, [param, type, description, required]]
const T = (server, rows) => rows.map(([name, description, params]) => ({
  name: `mcp__${server}__${name}`,
  description,
  parameters: { type: 'object', additionalProperties: false, properties: Object.fromEntries(params.map(([p, type, d]) => [p, { type, description: d }])), required: params.filter((x) => x[3]).map((x) => x[0]) },
}));
const repo = [['owner', 'string', 'Repository owner (username or organization)', 1], ['repo', 'string', 'Repository name', 1]];
const page = [['page', 'number', 'Page number for pagination (min 1)'], ['perPage', 'number', 'Results per page for pagination (min 1, max 100)']];
const tools = [
  ...T('github', [
    ['get_issue', 'Get details of a specific issue in a GitHub repository. Returns title, body, labels, assignees, state and timeline counts.', [...repo, ['issue_number', 'number', 'The number of the issue', 1]]],
    ['list_issues', 'List issues in a GitHub repository. For pagination, use the endCursor from the previous response. Supports filtering by state, labels and update time.', [...repo, ['state', 'string', 'Filter by state: OPEN or CLOSED'], ['labels', 'array', 'Filter by labels'], ['since', 'string', 'ISO 8601 timestamp, only issues updated at or after this time'], ...page]],
    ['create_issue', 'Create a new issue in a GitHub repository with a title, optional body, assignees, milestone and labels.', [...repo, ['title', 'string', 'Issue title', 1], ['body', 'string', 'Issue body content'], ['assignees', 'array', 'Usernames to assign'], ['labels', 'array', 'Labels to apply']]],
    ['update_issue', 'Update an existing issue in a GitHub repository: title, body, state, labels, assignees or milestone.', [...repo, ['issue_number', 'number', 'Issue number to update', 1], ['title', 'string', 'New title'], ['body', 'string', 'New description'], ['state', 'string', 'New state: open or closed']]],
    ['add_issue_comment', 'Add a comment to a specific issue or pull request in a GitHub repository.', [...repo, ['issue_number', 'number', 'Issue number to comment on', 1], ['body', 'string', 'Comment content', 1]]],
    ['search_issues', 'Search for issues in GitHub repositories using issues search syntax already scoped to is:issue. Returns up to 100 per page.', [['query', 'string', 'Search query using GitHub issues search syntax', 1], ['sort', 'string', 'Sort field: comments, reactions, created, updated'], ['order', 'string', 'Sort order: asc or desc'], ...page]],
    ['get_pull_request', 'Get details of a specific pull request in a GitHub repository, including mergeability and review state.', [...repo, ['pullNumber', 'number', 'Pull request number', 1]]],
    ['list_pull_requests', 'List pull requests in a GitHub repository, filtered by state, head, base and sorted by activity.', [...repo, ['state', 'string', 'Filter by state: open, closed, all'], ['head', 'string', 'Filter by head user/org and branch'], ['base', 'string', 'Filter by base branch'], ...page]],
    ['get_pull_request_diff', 'Get the diff of a pull request as unified diff text.', [...repo, ['pullNumber', 'number', 'Pull request number', 1]]],
    ['get_pull_request_files', 'Get the list of files changed in a pull request with additions, deletions and patch hunks.', [...repo, ['pullNumber', 'number', 'Pull request number', 1], ...page]],
    ['create_pull_request', 'Create a new pull request in a GitHub repository from a head branch into a base branch.', [...repo, ['title', 'string', 'PR title', 1], ['head', 'string', 'Branch containing changes', 1], ['base', 'string', 'Branch to merge into', 1], ['body', 'string', 'PR description'], ['draft', 'boolean', 'Create as draft PR']]],
    ['merge_pull_request', 'Merge a pull request using the chosen merge method.', [...repo, ['pullNumber', 'number', 'Pull request number', 1], ['merge_method', 'string', 'Merge method: merge, squash or rebase']]],
    ['get_file_contents', 'Get the contents of a file or directory from a GitHub repository at a given ref.', [...repo, ['path', 'string', 'Path to file or directory', 1], ['ref', 'string', 'Branch, tag or commit SHA']]],
    ['create_or_update_file', 'Create or update a single file in a GitHub repository. Provide the blob SHA when updating.', [...repo, ['path', 'string', 'Path where to create or update the file', 1], ['content', 'string', 'Content of the file', 1], ['message', 'string', 'Commit message', 1], ['branch', 'string', 'Branch to commit to', 1], ['sha', 'string', 'Blob SHA of the file being replaced']]],
    ['list_commits', 'Get list of commits of a branch in a GitHub repository, newest first.', [...repo, ['sha', 'string', 'Branch name, tag or commit SHA'], ['path', 'string', 'Only commits touching this path'], ...page]],
    ['get_commit', 'Get details for a commit from a GitHub repository including stats and changed files.', [...repo, ['sha', 'string', 'Commit SHA, branch name or tag name', 1]]],
    ['list_branches', 'List branches in a GitHub repository.', [...repo, ...page]],
    ['create_branch', 'Create a new branch in a GitHub repository from an existing ref.', [...repo, ['branch', 'string', 'Name for new branch', 1], ['from_branch', 'string', 'Source branch']]],
    ['search_code', 'Search for code across GitHub repositories using code search syntax.', [['query', 'string', 'Search query using GitHub code search syntax', 1], ['sort', 'string', 'Sort field'], ['order', 'string', 'asc or desc'], ...page]],
    ['search_repositories', 'Search for GitHub repositories by name, topic, language or owner.', [['query', 'string', 'Repository search query', 1], ...page]],
    ['list_workflow_runs', 'List workflow runs for a repository, filterable by status, branch and event.', [...repo, ['branch', 'string', 'Branch name'], ['status', 'string', 'Run status'], ...page]],
    ['get_job_logs', 'Download logs for a failed or completed workflow job.', [...repo, ['job_id', 'number', 'Workflow job ID', 1], ['tail_lines', 'number', 'Return only the last N lines']]],
    ['list_releases', 'List releases in a GitHub repository.', [...repo, ...page]],
    ['get_me', 'Get details of the authenticated GitHub user.', []],
    ['request_copilot_review', 'Request a Copilot review for a pull request.', [...repo, ['pullNumber', 'number', 'Pull request number', 1]]],
    ['list_notifications', 'List GitHub notifications for the authenticated user with filters.', [['filter', 'string', 'default, include_read_notifications or only_participating'], ...page]],
  ]),
  ...T('filesystem', [
    ['read_text_file', 'Read the complete contents of a file as text. Handles various text encodings. Use head or tail to read part of a file. Only works within allowed directories.', [['path', 'string', 'File path', 1], ['head', 'number', 'First N lines'], ['tail', 'number', 'Last N lines']]],
    ['read_multiple_files', 'Read the contents of multiple files simultaneously. Failed reads do not stop the whole operation.', [['paths', 'array', 'File paths to read', 1]]],
    ['write_file', 'Create a new file or completely overwrite an existing file with new content.', [['path', 'string', 'File path', 1], ['content', 'string', 'File content', 1]]],
    ['edit_file', 'Make line-based edits to a text file. Each edit replaces exact line sequences. Returns a git-style diff.', [['path', 'string', 'File path', 1], ['edits', 'array', 'List of {oldText, newText} edits', 1], ['dryRun', 'boolean', 'Preview changes using git-style diff format']]],
    ['create_directory', 'Create a new directory or ensure a directory exists, including nested directories.', [['path', 'string', 'Directory path', 1]]],
    ['list_directory', 'Get a detailed listing of all files and directories in a specified path.', [['path', 'string', 'Directory path', 1]]],
    ['directory_tree', 'Get a recursive tree view of files and directories as JSON.', [['path', 'string', 'Root path', 1]]],
    ['move_file', 'Move or rename files and directories.', [['source', 'string', 'Source path', 1], ['destination', 'string', 'Destination path', 1]]],
    ['search_files', 'Recursively search for files and directories matching a pattern. Case-insensitive, returns full paths.', [['path', 'string', 'Root path', 1], ['pattern', 'string', 'Glob-like pattern', 1], ['excludePatterns', 'array', 'Patterns to exclude']]],
    ['get_file_info', 'Retrieve detailed metadata about a file or directory: size, timestamps, permissions.', [['path', 'string', 'Path', 1]]],
    ['list_allowed_directories', 'Returns the list of directories this server is allowed to access.', []],
  ]),
  ...T('postgres', [
    ['query', 'Run a read-only SQL query against the database and return rows as JSON.', [['sql', 'string', 'SQL to run inside a read-only transaction', 1]]],
    ['list_tables', 'List all tables with schema, row estimates and sizes.', [['schema', 'string', 'Schema name, default public']]],
    ['describe_table', 'Describe columns, types, nullability, defaults, keys and indexes of one table.', [['table', 'string', 'Table name', 1], ['schema', 'string', 'Schema name']]],
    ['explain_query', 'Return the execution plan for a query without running it.', [['sql', 'string', 'SQL to explain', 1], ['analyze', 'boolean', 'Execute and include timings']]],
    ['list_indexes', 'List indexes with definitions and usage statistics.', [['table', 'string', 'Table name']]],
    ['table_stats', 'Return vacuum, analyze and dead tuple statistics.', [['table', 'string', 'Table name']]],
  ]),
  ...T('playwright', [
    ['browser_navigate', 'Navigate to a URL in the controlled browser.', [['url', 'string', 'The URL to navigate to', 1]]],
    ['browser_snapshot', 'Capture an accessibility snapshot of the current page. Better than a screenshot for choosing elements; returns a ref for every interactive element.', []],
    ['browser_click', 'Perform a click on a page element identified by its snapshot ref.', [['element', 'string', 'Human-readable element description', 1], ['ref', 'string', 'Exact target element reference from the page snapshot', 1], ['doubleClick', 'boolean', 'Whether to perform a double click']]],
    ['browser_type', 'Type text into an editable element.', [['element', 'string', 'Human-readable element description', 1], ['ref', 'string', 'Element reference', 1], ['text', 'string', 'Text to type', 1], ['submit', 'boolean', 'Press Enter after typing']]],
    ['browser_fill_form', 'Fill multiple form fields in one call.', [['fields', 'array', 'Fields to fill: name, type, ref, value', 1]]],
    ['browser_console_messages', 'Returns all console messages since the page loaded.', [['level', 'string', 'Minimum level: error, warning, info, debug']]],
    ['browser_network_requests', 'Returns all network requests since loading the page.', []],
    ['browser_take_screenshot', 'Take a screenshot of the current page or one element.', [['type', 'string', 'png or jpeg'], ['ref', 'string', 'Element reference'], ['fullPage', 'boolean', 'Capture the whole scrollable page']]],
    ['browser_evaluate', 'Evaluate a JavaScript expression on the page or an element.', [['function', 'string', 'Function source', 1], ['ref', 'string', 'Element reference']]],
    ['browser_wait_for', 'Wait for text to appear or disappear or for a fixed time.', [['text', 'string', 'Text to wait for'], ['textGone', 'string', 'Text to wait to disappear'], ['time', 'number', 'Seconds to wait']]],
    ['browser_select_option', 'Select option(s) in a dropdown.', [['element', 'string', 'Element description', 1], ['ref', 'string', 'Element reference', 1], ['values', 'array', 'Values to select', 1]]],
    ['browser_press_key', 'Press a key on the keyboard.', [['key', 'string', 'Name of the key, e.g. ArrowLeft or a', 1]]],
    ['browser_hover', 'Hover over an element.', [['element', 'string', 'Element description', 1], ['ref', 'string', 'Element reference', 1]]],
    ['browser_tabs', 'List, create, close or select a browser tab.', [['action', 'string', 'list, new, close or select', 1], ['index', 'number', 'Tab index']]],
    ['browser_resize', 'Resize the browser window.', [['width', 'number', 'Width', 1], ['height', 'number', 'Height', 1]]],
    ['browser_close', 'Close the page.', []],
  ]),
  ...T('slack', [
    ['list_channels', 'List public channels in the workspace with pagination.', [['limit', 'number', 'Max channels, default 100, max 200'], ['cursor', 'string', 'Pagination cursor']]],
    ['get_channel_history', 'Get recent messages from a channel.', [['channel_id', 'string', 'The ID of the channel', 1], ['limit', 'number', 'Number of messages, default 10']]],
    ['post_message', 'Post a new message to a Slack channel.', [['channel_id', 'string', 'The ID of the channel', 1], ['text', 'string', 'The message text', 1]]],
    ['reply_to_thread', 'Reply to a specific message thread.', [['channel_id', 'string', 'Channel ID', 1], ['thread_ts', 'string', 'Timestamp of the parent message', 1], ['text', 'string', 'Reply text', 1]]],
    ['add_reaction', 'Add a reaction emoji to a message.', [['channel_id', 'string', 'Channel ID', 1], ['timestamp', 'string', 'Message timestamp', 1], ['reaction', 'string', 'Emoji name without colons', 1]]],
    ['get_thread_replies', 'Get all replies in a message thread.', [['channel_id', 'string', 'Channel ID', 1], ['thread_ts', 'string', 'Timestamp of the parent message', 1]]],
    ['get_users', 'Get workspace users with basic profile information.', [['limit', 'number', 'Max users'], ['cursor', 'string', 'Pagination cursor']]],
    ['get_user_profile', 'Get detailed profile information for one user.', [['user_id', 'string', 'The user ID', 1]]],
  ]),
];

const words = 'cache queue retry worker session token render stream parse index merge shard lease flush cursor batch route policy limit digest probe'.split(' ');
const w = () => pick(words);

// ---- output builders ------------------------------------------------------------------------------------------
function testLog({ files = 70, failAt = 41 }) {
  const out = ['$ npm test', '', '> api@4.12.0 test', '> jest --ci --verbose', ''];
  for (let f = 0; f < files; f++) {
    const name = `src/${w()}/${w()}.test.ts`;
    const bad = f === failAt;
    out.push(`${bad ? ' FAIL' : ' PASS'} ${name} (${int(1, 9) / 10 + 0.1}s)`);
    for (let i = 0; i < int(5, 11); i++) out.push(`  ${bad && i === 3 ? '✕' : '✓'} ${w()} ${w()} when ${w()} is ${pick(['empty', 'full', 'stale', 'locked'])} (${int(1, 90)} ms)`);
    if (bad) out.push('', '  ● lease renewal › extends the lease when the worker is stale', '', '    expect(received).toEqual(expected)', '', '    Expected: 3', '    Received: 2', '', '      at Object.<anonymous> (src/lease/renew.test.ts:88:31)', '      at processTicksAndRejections (node:internal/process/task_queues:95:5)', '');
  }
  out.push('', 'Test Suites: 1 failed, ' + (files - 1) + ' passed, ' + files + ' total', 'Tests:       1 failed, ' + int(500, 700) + ' passed', 'Time:        41.2 s');
  return out.join('\n');
}
const passLog = () => '$ npm test\n\n PASS src/lease/renew.test.ts (0.4s)\n\nTest Suites: 70 passed, 70 total\nTests: 612 passed\nTime: 40.9 s';
function sourceFile(lines = 280) {
  const o = ["import { Lease } from './lease';", "import { clock } from '../util/clock';", ''];
  for (let i = 0; o.length < lines; i++) {
    o.push(`export function ${w()}${w()[0].toUpperCase()}${w().slice(1)}${i}(input: Lease, now = clock()): number {`, `  const age = now - input.updatedAt;`, `  if (age > input.ttl * 2) return input.attempts;`);
    if (i === 6) o.push('  // renewal bug: attempts is not incremented when the lease is stale', '  if (age > input.ttl) return input.attempts;');
    o.push(`  return input.attempts + ${int(0, 2)};`, '}', '');
  }
  return o.join('\n');
}
const issues = (n, special) => JSON.stringify(Array.from({ length: n }, (_, i) => {
  const num = i === special ? 1313 : 1400 - i * 3 - int(0, 2);
  const crash = i === special;
  return { number: num, title: crash ? 'Worker crashes with SIGSEGV on lease renewal under load' : `${w()} ${w()} ${pick(['fails', 'is slow', 'returns 500', 'needs docs'])} in ${w()}`, state: 'OPEN', user: { login: pick(['mira-k', 'devon22', 'lchen', 'oyelaran']), id: int(1e5, 9e6), type: 'User' },
    labels: [{ name: crash ? 'crash' : pick(['bug', 'docs', 'perf', 'question']), color: 'd73a4a' }], assignees: [], comments: int(0, 14), created_at: `2026-0${int(1, 9)}-${int(10, 28)}T09:${int(10, 59)}:00Z`, updated_at: '2026-11-10T11:02:00Z',
    body: `Steps to reproduce:\n1. start ${w()} with ${int(2, 16)} workers\n2. ${pick(['send traffic', 'kill a worker', 'rotate the key'])}\n3. observe the ${w()} log\n\nExpected: no error. Actual: stack trace in ${w()}.\n\n${'Environment: Node 24.1, linux-x64, region eu-west-1, build 4.12.0. '.repeat(3)}`,
    html_url: `https://github.com/acme/api/issues/${num}`, reactions: { total_count: int(0, 9), '+1': int(0, 5) } };
}), null, 2);
const rows = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ customer_id: 1000 + i, name: `${pick(['Acme', 'Globex', 'Initech', 'Umbrella'])} ${w()} ${i}`, plan: pick(['free', 'pro', 'team']), mrr_cents: i === 213 ? 982400 : int(0, 90000), created_at: `2025-0${int(1, 9)}-1${int(0, 9)}`, region: pick(['us-east', 'eu-west', 'ap-south']), last_seen: '2026-11-0' + int(1, 9) })));
function snapshot(n = 900) {
  const o = ['- generic [ref=e1]:', '  - banner [ref=e2]:', '    - link "Acme Billing" [ref=e3] [cursor=pointer]:', '      - /url: /'];
  for (let i = 0; o.length < n; i++) {
    if (i === 150) o.push('      - button "Submit payment" [ref=e871] [cursor=pointer]');
    o.push(`    - row "${w()} ${w()} ${int(10, 9999)}.00 USD ${pick(['paid', 'due', 'void'])}" [ref=e${100 + i}]:`, `      - cell "${w()}" [ref=e${2000 + i}]`, `      - cell "${int(1, 28)} Oct 2026" [ref=e${3000 + i}]`, `      - button "Download" [ref=e${4000 + i}] [cursor=pointer]`);
  }
  return o.join('\n');
}
const consoleMsgs = () => Array.from({ length: 80 }, (_, i) => i === 47 ? '[ERROR] Failed to load resource: the server responded with a status of 402 (Payment Required) @ https://api.acme.test/v2/charges' : `[LOG] ${w()} ${w()} ${int(1, 999)}ms @ app.js:${int(10, 900)}`).join('\n');
const paths = (n) => Array.from({ length: n }, (_, i) => `/repo/${i === 611 ? 'packages/billing/src/proration.ts' : `src/${w()}/${w()}${i}.ts`}`).join('\n');
const chat = (n) => JSON.stringify({ ok: true, messages: Array.from({ length: n }, (_, i) => ({ type: 'message', user: 'U' + int(1e6, 9e6), ts: `1731${900000 + i * 61}.000100`, team: 'T04XK2', text: i === 66 ? 'deploy of api 4.12.1 finished at 14:32 UTC, rollback window open until 15:30' : `${w()} ${w()} looks ${pick(['fine', 'odd', 'slow'])} on ${w()}, ${pick(['checking', 'ack', 'on it'])}`, reactions: i % 9 === 0 ? [{ name: 'eyes', count: 2, users: ['U1', 'U2'] }] : undefined, blocks: [{ type: 'rich_text', block_id: 'b' + i, elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: '...' }] }] }] })), has_more: true });

// ---- runs: each step output is what the real tool returns; facts are strings the final answer depends on --------
const M = (s, n) => `mcp__${s}__${n}`;
const runs = [
  { name: 'fix-failing-test', servers: ['filesystem', 'github'], task: 'Find why the lease test fails and fix it', facts: ['Expected: 3', 'Received: 2', 'src/lease/renew.test.ts:88'],
    steps: [['mcp__filesystem__list_directory', { path: '/repo/src/lease' }, 'renew.ts\nrenew.test.ts\nlease.ts'], ['mcp__filesystem__read_text_file', { path: '/repo/src/lease/renew.ts' }, sourceFile(280), ['renewal bug: attempts is not incremented']], [M('filesystem', 'list_directory'), { path: '/repo' }, 'package.json\nsrc\nREADME.md'], ['mcp__filesystem__edit_file', { path: '/repo/src/lease/renew.ts' }, '--- a/renew.ts\n+++ b/renew.ts\n@@ -41 +41 @@\n-  if (age > input.ttl) return input.attempts;\n+  if (age > input.ttl) return input.attempts + 1;'], [M('filesystem', 'search_files'), { path: '/repo', pattern: 'renew.test' }, '/repo/src/lease/renew.test.ts']], testStep: ['mcp__filesystem__read_text_file', { path: '/tmp/test.log' }, testLog({}), ['Expected: 3', 'Received: 2', 'src/lease/renew.test.ts:88']] },
  { name: 'triage-issues', servers: ['github'], task: 'Which open issue is the crash report?', facts: ['1313', 'SIGSEGV'],
    steps: [[M('github', 'list_issues'), { owner: 'acme', repo: 'api', state: 'OPEN', perPage: 60 }, issues(60, 31), ['SIGSEGV on lease renewal']], [M('github', 'get_issue'), { owner: 'acme', repo: 'api', issue_number: 1313 }, JSON.stringify({ number: 1313, title: 'Worker crashes with SIGSEGV on lease renewal under load', state: 'OPEN' })]] },
  { name: 'top-customer-sql', servers: ['postgres'], task: 'Who has the highest MRR?', facts: ['982400'],
    steps: [[M('postgres', 'list_tables'), { schema: 'public' }, 'customers 214 rows\ninvoices 9120 rows\nplans 3 rows'], [M('postgres', 'describe_table'), { table: 'customers' }, 'customer_id int pk\nname text\nplan text\nmrr_cents int\ncreated_at date\nregion text\nlast_seen date'], [M('postgres', 'query'), { sql: 'select * from customers' }, rows(240), ['"mrr_cents":982400']]] },
  { name: 'e2e-payment-bug', servers: ['playwright'], task: 'Why does Submit payment fail?', facts: ['e871', '402 (Payment Required)'],
    steps: [[M('playwright', 'browser_navigate'), { url: 'http://localhost:3000/billing' }, 'Navigated. Page title: Acme Billing'], [M('playwright', 'browser_snapshot'), {}, snapshot(900), ['button "Submit payment" [ref=e871]']], [M('playwright', 'browser_click'), { element: 'Submit payment', ref: 'e871' }, 'Clicked Submit payment'], [M('playwright', 'browser_console_messages'), {}, consoleMsgs(), ['402 (Payment Required)']]] },
  { name: 'find-proration-code', servers: ['filesystem', 'github'], task: 'Where is proration implemented?', facts: ['packages/billing/src/proration.ts'],
    steps: [[M('filesystem', 'search_files'), { path: '/repo', pattern: '.ts' }, paths(800), ['packages/billing/src/proration.ts']], [M('filesystem', 'read_text_file'), { path: '/repo/packages/billing/src/proration.ts', head: 40 }, sourceFile(40)]] },
  { name: 'deploy-time-slack', servers: ['slack'], task: 'When did the 4.12.1 deploy finish?', facts: ['14:32 UTC'],
    steps: [[M('slack', 'list_channels'), { limit: 20 }, JSON.stringify({ ok: true, channels: [{ id: 'C01DEPLOY', name: 'deploys' }, { id: 'C01GEN', name: 'general' }] })], [M('slack', 'get_channel_history'), { channel_id: 'C01DEPLOY', limit: 100 }, chat(100), ['14:32 UTC']]] },
  { name: 'small-control', servers: ['filesystem'], task: 'What is in the config dir?', facts: ['port: 8080'],
    steps: [[M('filesystem', 'list_directory'), { path: '/repo/config' }, 'app.yaml\nlogging.yaml'], [M('filesystem', 'read_text_file'), { path: '/repo/config/app.yaml' }, 'name: api\nport: 8080\nlog_level: info']] },
];
// fix-failing-test: the test log goes first in the run, as in the real order (run tests, read, edit, rerun)
const fix = runs[0];
fix.steps.splice(1, 0, fix.testStep); delete fix.testStep;
fix.steps.push(['mcp__filesystem__read_text_file', { path: '/tmp/test2.log' }, passLog(), ['612 passed']]);

const out = runs.map((r) => ({ name: r.name, task: r.task, facts: r.facts,
  tools: tools.filter((t) => r.servers.some((s) => t.name.startsWith(`mcp__${s}__`))),
  steps: r.steps.map(([tool, args, output, needs = []]) => ({ tool, args, output, needs })) }));
fs.writeFileSync(new URL('./runs.json', import.meta.url), JSON.stringify({ allTools: tools, runs: out }));
console.log(out.map((r) => `${r.name}: ${r.tools.length} tools, ${r.steps.length} steps`).join('\n'));
