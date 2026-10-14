import { validateEvent } from './validation.mjs';
import { makeRecord } from './record.mjs';
export function appendBatch(state, tenant, events) {
  const staged = state;
  const records = [];
  for (const event of events) {
    validateEvent(event);
    const record = makeRecord(tenant, event, ++staged.sequence);
    staged.records.push(record);
    records.push(record);
  }
  state.sequence = staged.sequence;
  state.records = staged.records;
  return records;
}
