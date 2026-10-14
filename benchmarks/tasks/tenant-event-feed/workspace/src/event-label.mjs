export function eventLabel(record) {
  return record.tenant + '/' + record.type + '#' + record.sequence;
}
