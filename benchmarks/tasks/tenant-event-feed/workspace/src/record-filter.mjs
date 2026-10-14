export function selectRecords(records, tenant, after) {
  return records.filter(record => record.tenant === tenant && record.sequence > after);
}
