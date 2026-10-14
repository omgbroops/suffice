import { selectRecords } from './record-filter.mjs';
import { validateTenant, validateCursor } from './validation.mjs';
import { snapshot } from './snapshot.mjs';
export function replay(store, tenant, after) {
  validateTenant(tenant);
  validateCursor(after);
  return selectRecords(store.state.records, tenant, after).map(snapshot);
}
