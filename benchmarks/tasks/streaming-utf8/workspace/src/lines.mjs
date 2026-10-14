import { ChunkDecoder } from './decoder.mjs';
export class LineReader {
  constructor() { this.decoder = new ChunkDecoder(); this.pending = ''; }
  feed(bytes) {
    this.pending += this.decoder.feed(bytes);
    const parts = this.pending.split('\n'); this.pending = parts.pop();
    return parts.map(line => line.replace(/\r$/, ''));
  }
  end() {
    this.pending += this.decoder.end();
    const last = this.pending.replace(/\r$/, ''); this.pending = '';
    return last ? [last] : [];
  }
}
export async function readLines(chunks) {
  const reader = new LineReader(); const lines = [];
  for await (const chunk of chunks) lines.push(...reader.feed(chunk));
  return [...lines, ...reader.end()];
}
