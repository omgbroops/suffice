import { selectRecords } from './record-filter.mjs';
export function countByType(records, tenant) {
  const result = {};
  for (const record of selectRecords(records, tenant, 0)) result[record.type] = (result[record.type] ?? 0) + 1;
  return result;
}
