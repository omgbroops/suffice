// Scenarios for variants-tools.mjs. One real haiku session each.
const Y = /^Yes/;
export const SCEN = {
  s1: { fn: async (r) => {
    await r.turn('Create notes.txt containing the single line: remember milk. Use the Write tool.', { run: [['Write--running', /Write\(/, 'spinner while Write runs']], dialogs: [{ snap: 'Write--permission-prompt', how: 'Write of a new file in default mode', pick: Y }], final: ['Write--finished-collapsed', 'Write--diff-new-file', 'Write--approved'], how: 'approved Yes once, new file', expand: 'Write--finished-expanded' });
    await r.turn('Use the Read tool on greet.js and tell me how many lines it has.', { run: [['Read--running', /Read\(/, 'spinner while Read runs']], final: 'Read--finished-collapsed', how: 'Read of small file, no prompt', expand: 'Read--finished-expanded' });
    await r.turn('Use the Read tool on missing-file.txt.', { final: 'Read--error-file-missing', how: 'Read of nonexistent file' });
    await r.turn('Use the Read tool on pic.png and describe it in five words.', { final: 'Read--image-file', how: 'Read of a PNG' });
    await r.turn('Use the Read tool on big.txt and tell me the last line.', { final: 'Read--long-output', how: 'Read of 140 line file', expand: 'Read--long-output-expanded' });
  } },
  s2: { fn: async (r) => {
    const P = (n, how) => ({ snap: n, how, pick: Y });
    await r.turn("Use the Edit tool: in greet.js replace 'Helo' with 'Hello'.", { dialogs: [P('Edit--permission-prompt', 'Edit of existing file, default mode')], final: ['Edit--finished-collapsed', 'Edit--diff-mixed', 'Edit--approved'], how: 'approved once', expand: 'Edit--finished-expanded' });
    await r.turn("Use the Edit tool on util.js: replace the line `exports.add = (a, b) => a + b;` with that same line followed by a new line `exports.sub = (a, b) => a - b;`.", { dialogs: [P('Edit--permission-prompt-additions-only', 'Edit that only adds a line')], final: 'Edit--diff-additions-only', how: 'Edit adding lines' });
    await r.turn("Use the Edit tool to delete the line `// greeting helper` from greet.js (replace it with nothing).", { dialogs: [P('Edit--permission-prompt-deletions-only', 'Edit that only removes a line')], final: 'Edit--diff-deletions-only', how: 'Edit removing a line' });
    await r.turn('Use the Write tool to overwrite big.txt with the numbers 1 to 60, one per line.', { dialogs: [P('Write--permission-prompt-overwrite-large', 'Write overwriting a 140 line file with 60 lines')], final: 'Write--diff-large', how: 'large overwrite', expand: 'Write--diff-large-expanded' });
    await r.turn("Use the Edit tool: in list.txt replace 'six' with '6'.", { dialogs: [{ snap: 'Edit--permission-prompt-deny', how: 'prompt before denying', pick: /^No/ }], final: 'Edit--denied-no', how: 'answered No' });
    await r.turn("Use the Edit tool: in list.txt replace 'seven' with '7'.", { dialogs: [{ snap: 'Edit--permission-prompt-feedback', how: 'prompt before feedback', custom: async () => {
      for (let i = 0; i < 6; i++) { const o = r.opts((await r.scr()).text); if (/^No/.test(o.find((x) => x.marked)?.label ?? '')) break; await r.bytes('down'); await r.sleep(250); }
      await r.bytes('tab'); await r.sleep(600); await r.type('use eight instead'); await r.sleep(500); await r.snap('Edit--denied-feedback-typing', 'No selected, Tab, feedback typed, before Enter'); await r.bytes('enter'); return 'No with feedback'; } }], final: 'Edit--denied-with-feedback', how: 'denied, feedback sent' });
    await r.turn('Use the Write tool to create extra.txt containing: extra.', { dialogs: [{ snap: 'Write--permission-prompt-allow-all', how: 'Write prompt, pick accept edits for session', pick: /accept edits/ }], final: 'Write--approved-allow-all-edits', how: 'chose accept edits for session' });
    await r.turn("Use the Edit tool: in list.txt replace 'one' with '1'.", { final: 'Edit--auto-approved-no-prompt', how: 'after accept-edits, no prompt' });
  } },
  s3: { fn: async (r) => {
    const P = (n, how) => ({ snap: n, how, pick: Y });
    await r.turn('Run the shell command ls and show me its output.', { run: [['Bash--running-quick', /Bash\(ls/, 'spinner while ls runs']], dialogs: [P('Bash--permission-prompt', 'plain ls in default mode')], final: ['Bash--finished-collapsed', 'Bash--approved'], how: 'approved once', expand: 'Bash--finished-expanded' });
    await r.turn('Make one Bash tool call whose command is three lines separated by real newlines: echo a, then echo b, then echo c. Do not use && or semicolons.', { dialogs: [P('Bash--permission-prompt-multiline', 'multi-line command prompt')], final: 'Bash--multiline-command', how: 'multi-line command finished' });
    await r.turn('Run exactly: node missing.js', { dialogs: [P('Bash--permission-prompt-node', 'node script prompt')], final: 'Bash--error-nonzero-exit', how: 'node exits 1', expand: 'Bash--error-nonzero-exit-expanded' });
    await r.turn('Run exactly: seq 1 200', { dialogs: [P('Bash--permission-prompt-seq', 'seq prompt')], final: 'Bash--long-output-truncated', how: '200 lines of output', expand: 'Bash--long-output-expanded' });
    await r.turn('Run exactly: sleep 6 && echo finished-sleep', { run: [['Bash--running', /Bash\(sleep/, 'spinner + tool row while sleep 6 runs']], dialogs: [P('Bash--permission-prompt-sleep', 'sleep prompt')], final: 'Bash--finished-after-wait', how: 'sleep 6 finished' });
    await r.turn('Run the Bash tool with command `sleep 30` and the timeout parameter set to 3000 milliseconds.', { run: [['Bash--running-timeout', /Bash\(sleep 30/, 'spinner while sleep 30 runs with 3 s timeout']], dialogs: [P('Bash--permission-prompt-timeout', 'sleep 30 prompt')], final: 'Bash--error-timeout', how: 'bash timeout 3000 ms', expand: 'Bash--error-timeout-expanded' });
  } },
  s4: { fn: async (r) => {
    const P = (n, how) => ({ snap: n, how, pick: Y });
    await r.turn('Run exactly: git status', { dialogs: [P('Bash--permission-prompt-prefix-git', 'git status prompt (look for a dont-ask-again prefix option)')], final: 'Bash--finished-git', how: 'git status approved once' });
    await r.turn('Run exactly: npm --version', { dialogs: [P('Bash--permission-prompt-prefix-npm', 'npm prompt')], final: 'Bash--finished-npm', how: 'npm approved once' });
    await r.turn('Run exactly: cd build && ls', { dialogs: [P('Bash--permission-prompt-compound', 'compound cd && ls prompt')], final: 'Bash--finished-compound', how: 'compound approved once' });
    await r.turn('Run exactly: cat a.txt b.txt | wc -l', { dialogs: [P('Bash--permission-prompt-pipe', 'pipeline prompt')], final: 'Bash--finished-pipe', how: 'pipeline approved once' });
    await r.turn('Run exactly: rm -rf build', { dialogs: [{ snap: 'Bash--permission-prompt-rm', how: 'rm -rf prompt', pick: /^No/ }], final: 'Bash--denied-no', how: 'answered No to rm' });
    await r.turn('Run exactly: echo hello', { dialogs: [{ snap: 'Bash--permission-prompt-deny-feedback', how: 'echo prompt, deny with feedback', custom: async () => {
      for (let i = 0; i < 6; i++) { const o = r.opts((await r.scr()).text); if (/^No/.test(o.find((x) => x.marked)?.label ?? '')) break; await r.bytes('down'); await r.sleep(250); }
      await r.bytes('tab'); await r.sleep(600); await r.type('use printf instead'); await r.sleep(500); await r.snap('Bash--denied-feedback-typing', 'No selected, Tab, feedback typed'); await r.bytes('enter'); return 'No with feedback'; } }], final: 'Bash--denied-with-feedback', how: 'denied with feedback text' });
    await r.turn('Run exactly: echo allowall', { dialogs: [{ snap: 'Bash--permission-prompt-options-final', how: 'echo prompt, choose the second option', pick: /^Yes, and/ }], final: 'Bash--approved-dont-ask-again', how: 'chose second yes option' });
  } },
  s5: { fn: async (r) => {
    await r.turn('Run exactly: node -e "setTimeout(()=>{},25000)"', { dialogs: [{ snap: 'Bash--permission-prompt-long', how: 'long node prompt', pick: Y, after: 3000, then: async () => { await r.snap('Bash--running', 'Bash tool mid-run (node sleeps 25s)'); await r.bytes('esc'); await r.sleep(1500); } }], final: 'Bash--interrupted-esc', how: 'Esc pressed during running Bash' });
    await r.turn('Use the Bash tool with run_in_background true to run: node -e "setTimeout(()=>console.log(\'bgdone\'),6000)"', { dialogs: [{ snap: 'Bash--permission-prompt-background', how: 'background bash prompt', pick: Y }], final: 'Bash--background-started', how: 'run_in_background started' });
    await r.sleep(7000);
    await r.turn('Read the output of that background task with the BashOutput or TaskOutput tool.', { final: 'Bash--background-output', how: 'later turn reading background output' });
    await r.turn('Use the Read tool on a.txt and b.txt in parallel in one turn.', { run: [['Read--parallel-running', /Reading|Read\(/, 'parallel reads in flight']], final: 'Read--parallel', how: 'two Read calls in one turn' });
  } },
  s6: { fn: async (r) => {
    await r.turn('Use the Glob tool with pattern **/*.js.', { final: 'Glob--finished-collapsed', how: 'Glob finished', expand: 'Glob--finished-expanded' });
    await r.turn('Use the Glob tool with pattern **/*.nomatch.', { final: 'Glob--no-matches', how: 'Glob with no results' });
    await r.turn('Use the Grep tool for pattern "greet" in this folder, output mode content.', { final: 'Grep--finished-collapsed', how: 'Grep finished', expand: 'Grep--finished-expanded' });
    await r.turn('Use the Grep tool with the invalid regex pattern "(unclosed".', { final: 'Grep--error-bad-regex', how: 'Grep with invalid regex' });
    await r.turn('Use the MultiEdit tool if you have it, to change alpha to ALPHA in a.txt and beta to BETA in b.txt. If you have no MultiEdit tool say so.', { final: 'MultiEdit--attempt', how: 'MultiEdit requested (tool may not exist)' });
  } },
  s7: { fn: async (r) => {
    await r.turn('Use the WebFetch tool on https://example.com and give the page title.', { dialogs: [{ snap: 'WebFetch--permission-prompt', how: 'WebFetch domain prompt', pick: Y }], final: 'WebFetch--finished-collapsed', how: 'WebFetch approved', expand: 'WebFetch--finished-expanded' });
    await r.turn('Use the WebFetch tool on https://example.com/about and give the first line.', { dialogs: [{ snap: 'WebFetch--permission-prompt-second', how: 'WebFetch second prompt', pick: /^No/ }], final: 'WebFetch--denied-no', how: 'WebFetch denied' });
    await r.turn('Use the WebSearch tool to search for: example domain iana. One line answer.', { dialogs: [{ snap: 'WebSearch--permission-prompt', how: 'WebSearch prompt', pick: Y }], final: 'WebSearch--finished-collapsed', how: 'WebSearch approved', expand: 'WebSearch--finished-expanded' });
  } },
  s8: { fn: async (r) => {
    await r.turn('Use the TodoWrite tool (or the task list tool) to make a 3 item todo list: a, b, c, then mark the first done.', { dialogs: [{ snap: 'TodoWrite--permission-prompt', how: 'todo prompt if any', pick: Y }], final: 'TodoWrite--finished', how: 'todo list written', expand: 'TodoWrite--finished-expanded' });
    await r.turn('Use the Agent tool to launch a subagent that reads a.txt and reports its content.', { run: [['Agent--running', /Agent|Task|subagent/i, 'subagent in flight']], dialogs: [{ snap: 'Agent--permission-prompt', how: 'agent child prompt', pick: Y }, { pick: Y }, { pick: Y }], final: 'Agent--finished-collapsed', how: 'subagent finished', expand: 'Agent--finished-expanded' });
    await r.turn('Use the Skill tool to run the hello skill.', { dialogs: [{ snap: 'Skill--permission-prompt', how: 'skill prompt', pick: Y }], final: 'Skill--finished', how: 'hello skill', expand: 'Skill--finished-expanded' });
  } },
  s9: { fn: async (r) => {
    await r.turn('Use the NotebookEdit tool to change the source of cell c1 in demo.ipynb to "x = 2".', { dialogs: [{ snap: 'NotebookEdit--permission-prompt', how: 'notebook edit prompt', pick: Y }], final: 'NotebookEdit--finished', how: 'notebook edited', expand: 'NotebookEdit--finished-expanded' });
    await r.turn('Use the AskUserQuestion tool to ask me which color, red or blue.', { dialogs: [{ snap: 'AskUserQuestion--dialog', how: 'question dialog', pick: /./ }], final: 'AskUserQuestion--answered', how: 'answered first option' });
  } },
  s10: { opts: { mode: 'plan' }, fn: async (r) => {
    await r.turn('Plan a one-line change: rename greet to hello in greet.js. Then exit plan mode with the ExitPlanMode tool.', { dialogs: [{ snap: 'ExitPlanMode--prompt', how: 'plan approval dialog', pick: /^No|keep planning/i }], final: 'ExitPlanMode--rejected', how: 'plan rejected, keep planning' });
  } },
};
