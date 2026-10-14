export function validateTenant(tenant) {
  if (typeof tenant !== 'string' || !tenant) throw new Error('Invalid tenant');
}
export function validateEvent(event) {
  if (!event || typeof event.type !== 'string' || !event.type || !event.payload || Object.getPrototypeOf(event.payload) !== Object.prototype) throw new Error('Invalid event');
  structuredClone(event.payload);
}
export function validateCursor(after) {
  if (!Number.isInteger(after) || after < 0) throw new Error('Invalid cursor');
}
