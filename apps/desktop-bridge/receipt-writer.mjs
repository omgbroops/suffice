import {basename, resolve} from 'node:path';
import {loadDesktopBinding} from './native-binding.mjs';

export function verifyReceiptWriter(binding) {
  const prototype = binding.ReceiptWriter?.prototype;
  if (binding.receiptWriterProtocolVersion?.() !== 1 ||
      typeof binding.ReceiptWriter !== 'function' ||
      !['appendPage', 'flush', 'close'].every(method => typeof prototype[method] === 'function')) {
    throw new Error('Native receipt writer protocol 1 is required');
  }
}

// The CLI constructs both arguments; the renderer cannot choose a sink or filename.
export function createNativeReceiptWriter({home, eventPath}) {
  const filename = basename(eventPath);
  if (eventPath !== resolve(home, 'events', filename)) throw new Error('Invalid usage receipt path');
  let writer, closing;
  let tail = Promise.resolve();

  function enqueue(operation) {
    const result = tail.then(operation);
    // Return this operation's failure to its caller. The next record still
    // reaches native admission, which knows whether the file is at a boundary.
    tail = result.catch(() => {});
    return result;
  }

  async function appendRecord(line) {
    if (!writer) {
      const binding = await loadDesktopBinding();
      verifyReceiptWriter(binding);
      writer = new binding.ReceiptWriter(home, filename);
    }
    // A page of 256 Ki UTF-16 units takes at most 768 KiB in UTF-8.
    // JSON.stringify escapes lone surrogates; preserve complete pairs at seams.
    for (let start = 0; start < line.length;) {
      let end = Math.min(start + 256 * 1024, line.length);
      if (end < line.length) {
        const last = line.charCodeAt(end - 1);
        if (last >= 0xd800 && last <= 0xdbff) end--;
      }
      await writer.appendPage(line.slice(start, end), end === line.length);
      start = end;
    }
  }

  return {
    append(line) {
      if (closing) return Promise.reject(new Error('Receipt writer is closed'));
      return enqueue(() => appendRecord(line));
    },
    flush() {
      return closing ?? enqueue(() => writer?.flush());
    },
    close() {
      return closing ??= enqueue(() => writer?.close());
    },
  };
}
