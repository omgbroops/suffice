#!/usr/bin/env node
// sessions <new|ls|attach|send|stop|screen|history|resume> ... (see index.mjs)
import { createSessions } from '../sessions/index.mjs';
import { createExec } from '../runner/index.mjs';
import { run } from './index.mjs';

const sessions = createSessions({ exec: createExec(), clock: { now: Date.now } });
process.exitCode = await run(process.argv.slice(2), { sessions });
