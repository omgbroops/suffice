export class ChunkDecoder {
  constructor() { this.decoder = new TextDecoder('utf-8'); }
  feed(bytes) { return this.decoder.decode(bytes); }
  end() { return this.decoder.decode(); }
}
