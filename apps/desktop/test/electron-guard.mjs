import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
// Local-only dialog guard: when present, Electron loads it first so crashes and dialogs go to stderr, not the screen.
const P='/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs';
export const guard=existsSync(P)?['-r',P]:[];
// Stops a test's private tmux server (tmux -L <socket>); call in finally so it dies even when the test fails. Never pass 'suffice'.
export const killTmux=socket=>{if(socket&&socket!=='suffice')try{execFileSync('tmux',['-L',socket,'kill-server'],{stdio:'ignore'});}catch{}};
