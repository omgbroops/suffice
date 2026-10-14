import { validateTenant } from './validation.mjs';
import { appendBatch } from './batch-commit.mjs';
import { snapshot } from './snapshot.mjs';
export function publish(store, bus, tenant, events) {
  validateTenant(tenant);
  if (!Array.isArray(events)) throw new Error('Invalid batch');
  const records = appendBatch(store.state, tenant, events);
  records.forEach(record => bus.emit(record));
  return records.map(snapshot);
}
