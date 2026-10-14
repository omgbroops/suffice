import { snapshot } from './snapshot.mjs';
export function makeRecord(tenant, event, sequence) {
  return snapshot({ tenant, type: event.type, payload: event.payload, sequence });
}
