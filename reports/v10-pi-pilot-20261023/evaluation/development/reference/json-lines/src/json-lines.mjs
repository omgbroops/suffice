export async function* parseJsonLines(chunks) {
  // Preserve the decoded BOM so the stream-level rule is applied exactly once.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let buffer = '';
  let start = true;
  let physicalLine = 0;

  function append(text) {
    if (start && text.length) {
      start = false;
      if (text[0] === '\uFEFF') text = text.slice(1);
    }
    buffer += text;
  }

  function parse(line) {
    physicalLine += 1;
    if (!line.trim()) return { empty: true };
    try {
      return { empty: false, value: JSON.parse(line) };
    } catch (error) {
      if (error instanceof SyntaxError) error.lineNumber = physicalLine;
      throw error;
    }
  }

  for await (const chunk of chunks) {
    if (typeof chunk === 'string') {
      // A string boundary also finishes a preceding, complete byte sequence.
      append(decoder.decode());
      append(chunk);
    } else {
      append(decoder.decode(chunk, { stream: true }));
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const parsed = parse(line);
      if (!parsed.empty) yield parsed.value;
    }
  }
  append(decoder.decode());
  if (buffer.length) {
    const parsed = parse(buffer);
    if (!parsed.empty) yield parsed.value;
  }
}
