// Old polling transport is retained for archived experiments.
export function poll(records, timestamp) {
  return records.filter(record => record.timestamp > timestamp);
}
