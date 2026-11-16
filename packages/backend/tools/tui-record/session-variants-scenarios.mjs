// Scenarios for session-variants.mjs. Each gets the helper object H and uses one real haiku session.
const start = async (H, dir = '.', o = {}) => { H.setup(dir, o.setup); H.launch(o.launch); await H.ready(); H.snap('idle', 'fresh start'); };
const esc = (H) => H.key('Escape');

export const SC = {
  async smoke(H) { await start(H); H.key('C-c'); await H.sleep(600); H.snap('ctrlc-once', 'Ctrl+C once'); H.key('C-c'); await H.sleep(1500); H.snap('exit-screen', 'Ctrl+C twice'); },
  async working(H) {
    await start(H);
    await H.turn('Run `sleep 6` with bash, then say done in one sentence.', 'phase', 8);
    H.snap('finished', 'after turn');
    H.key('M-t'); await H.sleep(500); H.snap('thinking-toggle-alt-t', 'Alt+T');
    H.key('C-o'); await H.sleep(700); H.snap('transcript-ctrl-o', 'Ctrl+O'); H.key('C-o'); await H.sleep(500);
  },
  async markdown(H) {
    await start(H);
    await H.say('Reply with only markdown, no tools: an H1, an H2, a bullet list of 3, a numbered list of 3, a js code block of 3 lines, a 3-row table, a link to https://example.com, and one 200-word paragraph with no line breaks.');
    await H.sleep(2500); H.snap('stream-120', 'mid stream');
    H.tm('resize-window', '-t', 'v', '-x', '70', '-y', '40'); await H.sleep(800); H.snap('resize-70-midstream', 'resized to 70 cols while streaming');
    await H.untilIdle(90000); H.snap('done-70', 'after stream at 70 cols');
    H.tm('resize-window', '-t', 'v', '-x', '120', '-y', '40'); await H.sleep(1200); H.snap('done-120', 'resized back to 120');
  },
  async widths(H) {
    for (const w of [60, 40, 200]) {
      if (w === 60) await start(H, '.', { launch: { cols: 60 } }); else { H.tm('resize-window', '-t', 'v', '-x', String(w), '-y', '40'); await H.sleep(800); }
      await H.say('Run `sleep 8` with bash then say ok.'); await H.sleep(5000); H.snap(`tool-${w}cols`, `width ${w} during tool`); await H.untilIdle(60000);
    }
  },
  async modes(H) {
    await start(H, '.', { launch: { args: ['--permission-mode', 'default'] } });
    for (let i = 1; i <= 5; i++) { H.key('BTab'); await H.sleep(700); H.snap(`mode-${i}`, `Shift+Tab x${i}`); }
  },
  async acceptedit(H) {
    await start(H, '.', { launch: { args: ['--permission-mode', 'acceptEdits'] } });
    await H.turn("Edit greet.js: fix the typo 'Helo' to 'Hello'. Nothing else.", 'edit', 5); H.snap('after-edit', 'edit auto-accepted');
  },
  async plan(H) {
    await start(H, '.', { launch: { args: ['--permission-mode', 'plan'] } });
    await H.say('Plan how to add a farewell(name) function to greet.js. Keep the plan to 3 bullets. Then call ExitPlanMode.');
    await H.waitFor(/Would you like to proceed|Ready to code|Do you want to proceed|proceed\?/i, 90000); await H.sleep(800); H.snap('plan-presented', 'plan approval dialog');
    H.key('Down'); await H.sleep(400); H.snap('plan-option-2', 'Down once'); H.key('Down'); await H.sleep(400); H.snap('plan-option-3', 'Down twice');
    esc(H); await H.sleep(1200); H.snap('plan-rejected-esc', 'Esc');
    await H.untilIdle(60000).catch(() => {});
    await H.say('Revise: make it 2 bullets, then call ExitPlanMode again.');
    await H.waitFor(/proceed|Ready to code/i, 90000); await H.sleep(800);
    H.key('Down'); H.key('Down'); H.key('Down'); await H.sleep(300); H.snap('plan-keep-planning-selected', 'last option');
    H.enter(); await H.sleep(1500); H.snap('plan-keep-planning', 'chose keep planning');
    await H.untilIdle(90000).catch(() => {});
    await H.say('Now call ExitPlanMode again with the plan.');
    await H.waitFor(/proceed|Ready to code/i, 90000); await H.sleep(800);
    H.enter(); await H.untilIdle(120000, H.sampler('approved', 4)); H.snap('plan-approved-done', 'approved with first option');
  },
  async ask(H) {
    await start(H);
    await H.say('Use the AskUserQuestion tool once: ask one single-choice question "Pick a color" with options red, green, blue.');
    await H.waitFor(/^\s*(❯\s*)?1\./m, 60000); await H.sleep(800); H.snap('single-choice', 'single select'); H.key('Down'); await H.sleep(300); H.snap('single-choice-moved', 'Down'); H.enter(); await H.untilIdle(90000);
    await H.say('Use AskUserQuestion once with one multiSelect question "Pick fruits" with options apple, pear, plum.');
    await H.waitFor(/^\s*(❯\s*)?1\./m, 60000); await H.sleep(800); H.snap('multi-choice', 'multi select'); H.key('Space'); H.key('Down'); H.key('Space'); await H.sleep(400); H.snap('multi-choice-checked', 'two toggled'); H.enter(); await H.sleep(800); H.snap('multi-after-enter', 'Enter'); esc(H); await H.sleep(800);
    await H.untilIdle(90000).catch(() => {});
    await H.say('Use AskUserQuestion once: a single-choice question "Pick a pet" with options cat, dog.');
    await H.waitFor(/^\s*(❯\s*)?1\./m, 60000); await H.sleep(800);
    H.key('Down'); H.key('Down'); await H.sleep(300); H.snap('other-selected', 'Other row'); H.type('hamster'); await H.sleep(500); H.snap('other-typed', 'typed Other text'); H.enter(); await H.untilIdle(90000).catch(() => {});
    await H.say('Use AskUserQuestion once with TWO questions in the same call: "Pick a color" (red, green) and "Pick a size" (small, large).');
    await H.waitFor(/^\s*(❯\s*)?1\./m, 60000); await H.sleep(800); H.snap('two-questions-first', 'first of two'); H.enter(); await H.sleep(1000); H.snap('two-questions-second', 'second'); H.enter(); await H.sleep(1000); H.snap('two-questions-review', 'review tab'); esc(H); await H.sleep(800);
    await H.untilIdle(60000).catch(() => {});
  },
  async queue(H) {
    await start(H);
    await H.say('Run `sleep 20` with bash then say ok.'); await H.sleep(5000);
    await H.say('first queued'); await H.sleep(800); H.snap('queued-one', 'one queued');
    await H.say('second queued'); await H.sleep(800); H.snap('queued-two', 'two queued');
    H.key('Up'); await H.sleep(800); H.snap('queued-edit-up', 'Up pulls queued back to input');
    H.key('C-u'); await H.sleep(500); H.snap('queued-edit-cleared', 'Ctrl+U');
    esc(H); await H.sleep(1000); H.snap('queued-after-esc', 'Esc');
    await H.untilIdle(120000).catch(() => {}); H.snap('queued-drained', 'after');
  },
  async interrupt(H) {
    await start(H);
    await H.say('Write 400 words about the sea, no tools.'); await H.sleep(4000); H.snap('before-esc-text', 'streaming'); esc(H); await H.sleep(1500); H.snap('interrupted-text', 'Esc mid text');
    await H.say('Run `sleep 25` with bash.'); await H.sleep(6000); H.snap('before-esc-tool', 'tool running'); esc(H); await H.sleep(1500); H.snap('interrupted-tool', 'Esc mid tool');
  },
  async cmds(H) {
    await start(H);
    await H.turn('Say hi in 3 words.', 'turn1', 2); await H.turn('Say bye in 3 words.', 'turn2', 2);
    for (const c of ['/context', '/cost', '/usage']) { await H.say(c); await H.sleep(2500); H.snap(c.slice(1), `slash ${c}`); esc(H); await H.sleep(700); }
    await H.say('/compact'); await H.sleep(2500); H.snap('compact-running', '/compact working'); await H.untilIdle(120000, H.sampler('compact-working', 3)); H.snap('compact-done', '/compact finished');
    await H.say('/clear'); await H.sleep(2000); H.snap('clear-done', '/clear');
  },
  async todo(H) {
    await start(H);
    await H.say('Use the TodoWrite tool to make a 3-item todo list (a, b, c), then mark each completed one at a time using TodoWrite, each in its own call. No other tools.');
    await H.untilIdle(120000, H.sampler('todo', 8)); H.snap('todo-final', 'after');
  },
  async hooks(H) {
    const hook = (b) => `#!/bin/sh\n${b}\n`;
    const settings = { permissions: { allow: ['Bash(echo:*)', 'Bash(ls:*)', 'Read'] }, statusLine: { type: 'command', command: 'echo "STATUS demo line"' },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './.claude/block.sh' }] }], PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: './.claude/post.sh' }] }], UserPromptSubmit: [{ hooks: [{ type: 'command', command: './.claude/ctx.sh' }] }] } };
    const extra = { '.claude/block.sh': hook('if grep -q "blockme" ; then echo "blocked by project hook" >&2; exit 2; fi'), '.claude/post.sh': hook('echo "post hook ran"'), '.claude/ctx.sh': hook('echo "Extra context: the secret word is pelican."') };
    await start(H, '.', { setup: { settings, extra } });
    await H.turn('What is the secret word? One word.', 'ctx', 2);
    await H.turn('Read README.txt and say ok.', 'post', 3); H.snap('post-hook', 'post hook after Read');
    await H.turn('Run `echo blockme` with bash.', 'block', 3); H.snap('block-hook', 'pre hook blocked bash');
  },
  async input(H) {
    await start(H);
    H.type('!echo hello-bash'); await H.sleep(500); H.snap('bash-mode-typed', '! typed'); H.enter(); await H.sleep(2500); H.snap('bash-mode-output', 'after !cmd');
    H.type('#'); await H.sleep(500); H.snap('memory-hash-typed', '# typed'); H.type(' remember x'); await H.sleep(400); H.snap('memory-hash-text', '# with text'); H.key('C-u'); esc(H); await H.sleep(600);
    H.type('@a'); await H.sleep(1200); H.snap('at-popup', '@a'); H.key('Down'); await H.sleep(300); H.snap('at-popup-down', 'Down'); H.key('Tab'); await H.sleep(600); H.snap('at-selected', 'Tab'); H.key('C-u'); await H.sleep(400);
    H.paste(Array.from({ length: 30 }, (_, i) => `pasted line ${i + 1}`).join('\n')); await H.sleep(900); H.snap('paste-placeholder', 'long paste'); H.key('C-u'); await H.sleep(400);
    H.type('line one\\'); await H.sleep(300); H.enter(); await H.sleep(300); H.type('line two'); await H.sleep(500); H.snap('multiline', 'backslash newline'); H.key('C-u'); await H.sleep(400);
    await H.turn('Say ok.', 'hist', 1); H.key('Up'); await H.sleep(600); H.snap('history-up', 'Up'); H.key('C-u');
  },
  async rewind(H) {
    await start(H);
    for (const t of ['Say one.', 'Say two.', 'Say three.']) await H.turn(t, 'rw', 1);
    esc(H); await H.sleep(300); esc(H); await H.sleep(1200); H.snap('rewind-menu', 'double Esc'); H.key('Up'); await H.sleep(400); H.snap('rewind-menu-up', 'Up');
    H.enter(); await H.sleep(1000); H.snap('rewind-choices', 'Enter on a turn'); esc(H); await H.sleep(800); H.snap('rewind-back', 'Esc'); esc(H); await H.sleep(800); H.snap('rewind-closed', 'Esc again');
  },
  async export(H) {
    await start(H); await H.turn('Say hi.', 'x', 1);
    await H.say('/export'); await H.sleep(2000); H.snap('export-choices', '/export'); esc(H); await H.sleep(800); H.snap('export-cancelled', 'Esc');
    H.key('C-d'); await H.sleep(500);
    await H.say('/exit'); await H.sleep(2000); H.snap('exit-slash', '/exit');
  },
  async resume(H) {
    await start(H); H.type('/resume'); await H.sleep(800); H.enter(); await H.sleep(2000); H.snap('resume-picker', '/resume'); H.key('Down'); await H.sleep(400); H.snap('resume-picker-down', 'Down'); esc(H); await H.sleep(800); H.snap('resume-cancelled', 'Esc');
  },
};
