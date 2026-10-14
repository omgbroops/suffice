export function snapshot(record) {
  return { ...record, payload: { ...record.payload } };
}
