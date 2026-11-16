// Embedded only in the trusted app document. Rust sees base64 fragments and
// routing metadata. JSON interpretation stays in the JavaScript engine.
(function createRendererReceiver(deliver) {
  let current;
  return function accept(frame) {
    try {
      const {transfer, offset, total, data} = frame;
      if (!Number.isSafeInteger(transfer) || transfer < 1 ||
          !Number.isSafeInteger(total) || total < 1 || total > 512 * 1024 * 1024 ||
          !Number.isSafeInteger(offset) || offset < 0 || offset >= total ||
          typeof data !== 'string' || !data.length || data.length > 1024 * 1024 || data.length % 4) {
        throw new Error('Invalid bridge fragment');
      }
      if (offset === 0) {
        if (current) throw new Error('Interrupted bridge transfer');
        current = {transfer, total, received:0, text:[], decoder:new TextDecoder('utf-8', {fatal:true})};
      }
      if (!current || current.transfer !== transfer || current.total !== total || current.received !== offset) {
        throw new Error('Out-of-order bridge fragment');
      }
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      current.received += bytes.length;
      if (current.received > total) throw new Error('Bridge transfer exceeds its declared size');
      const complete = current.received === total;
      current.text.push(current.decoder.decode(bytes, {stream:!complete}));
      if (complete) {
        const parts = current.text;
        current = undefined;
        const message = JSON.parse(parts.join(''));
        if (message.type !== 'reply' && message.type !== 'event') throw new Error('Invalid bridge message type');
        deliver(message);
      }
      return true;
    } catch (error) {
      current = undefined;
      throw error;
    }
  };
})
