// Each physical write completes before the next fragment is encoded. The host
// also waits for WebView evaluation before it reads the next pipe record.
export const MAX_LOGICAL_BYTES = 512 * 1024 * 1024;
export const MAX_PART_BYTES = 768 * 1024;
const MAX_QUEUED_MESSAGES = 65536;
const CODE_UNITS_PER_PART = MAX_PART_BYTES / 3;

export function* rendererFrames(json, bytes, transfer) {
  let offset = 0;
  for (let start = 0; start < json.length;) {
    let end = Math.min(json.length, start + CODE_UNITS_PER_PART);
    // JSON.stringify escapes lone surrogates, but keeps valid pairs literal.
    if (end < json.length && json.charCodeAt(end - 1) >= 0xd800 && json.charCodeAt(end - 1) <= 0xdbff) end--;
    const part = Buffer.from(json.slice(start, end), 'utf8');
    yield {type:'renderer-chunk', transfer, offset, total:bytes, data:part.toString('base64')};
    start = end;
    offset += part.length;
  }
}

export function createOutput(stream, onFailure) {
  const queue = [];
  let active = false, pendingBytes = 0, sequence = 0, failure;
  const write = line => new Promise((resolve, reject) => {
    stream.write(line + '\n', err => err ? reject(err) : resolve());
  });

  async function drain() {
    active = true;
    try {
      while (queue.length) {
        const item = queue[0];
        if (item.renderer) {
          for (const frame of rendererFrames(item.json, item.bytes, ++sequence)) {
            await write(JSON.stringify(frame));
          }
        } else {
          await write(item.json);
        }
        queue.shift();
        pendingBytes -= item.bytes;
      }
    } catch (error) {
      failure = error;
      queue.length = 0;
      pendingBytes = 0;
      onFailure(error);
    } finally {
      active = false;
    }
  }
  return message => {
    if (failure) throw failure;
    const renderer = message.type === 'reply' || message.type === 'event';
    // Native operations require Rust values. Keep their outer request ID readable
    // even when a JavaScript argument cannot be represented by the OS adapter.
    const json = message.type === 'native'
      ? JSON.stringify({type:'native', id:message.id, method:message.method, argsJson:JSON.stringify(message.args)})
      : JSON.stringify(message);
    const bytes = Buffer.byteLength(json);
    if (bytes > MAX_LOGICAL_BYTES || (!renderer && bytes + 1 > 64 * 1024 * 1024)) throw new Error('Bridge message exceeds its transport limit');
    if (pendingBytes + bytes > MAX_LOGICAL_BYTES || queue.length >= MAX_QUEUED_MESSAGES) throw new Error('Bridge output queue limit reached');
    queue.push({json, bytes, renderer});
    pendingBytes += bytes;
    if (!active) void drain();
  };
}
