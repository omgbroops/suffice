// Synthetic agent for tests: prompt, echo each stdin line as ECHO:<line>, append a JSONL record per line.
import fs from 'node:fs';
import readline from 'node:readline';

const transcript = process.argv[2];
if (process.argv[3] === 'raw') process.stdin.setRawMode(true); // like a real TUI agent: no 1024-byte tty line limit
process.stdout.write('READY> ');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  process.stdout.write(`\nECHO:${line}\nREADY> `);
  if (transcript) fs.appendFileSync(transcript, `${JSON.stringify({ k: 'u', t: line })}\n${JSON.stringify({ k: 'a', t: `ECHO:${line}` })}\n`);
});
