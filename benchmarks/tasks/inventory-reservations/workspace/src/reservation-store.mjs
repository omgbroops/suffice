import { requestKey } from './request-key.mjs';
export function createReservations() {
  const records = new Map();
  return {
    get: (tenant, id) => records.get(requestKey(tenant, id)),
    set: (tenant, id, receipt) => records.set(requestKey(tenant, id), structuredClone(receipt)),
  };
}
