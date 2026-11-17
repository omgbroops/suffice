import {existsSync} from 'node:fs';
// Local-only dialog guard: when present, Electron loads it first so crashes and dialogs go to stderr, not the screen.
const P='/Users/abhayg/suffice-desktop-wt/ui-shots/no-dialog.cjs';
export const guard=existsSync(P)?['-r',P]:[];
