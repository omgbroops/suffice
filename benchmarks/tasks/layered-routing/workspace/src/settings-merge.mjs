import { mergeFields } from './field-merge.mjs';
import { mergeHeaders } from './header-merge.mjs';
export function mergeSettings(...layers) {
  const result = {};
  for (const layer of layers) {
    mergeFields(result, layer);
    if (Object.hasOwn(layer, 'headers')) result.headers = mergeHeaders(result.headers ?? {}, layer.headers);
  }
  return result;
}
