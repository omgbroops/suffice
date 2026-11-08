import {getEncoding} from 'js-tiktoken';

let encoding;
export const TOKENIZER='o200k_base/js-tiktoken-1.0.21';
export function countTokens(text){return (encoding??=getEncoding('o200k_base')).encode(String(text),[],[]).length;}
// The catalog's Sol tokenizer is not specified. In addition to reporting BPE
// counts, enforce the UTF-8 byte upper bound for byte-level tokenizers. This is
// deliberately stricter than spending the full nominal 400-token allowance.
export function packetRepresentation(text){return JSON.stringify({content:[{type:'text',text}]});}
export function fitsPacket(text,maxTokens){const serialized=packetRepresentation(text);return countTokens(serialized)+2<=maxTokens&&Buffer.byteLength(serialized)+2<=maxTokens;}
