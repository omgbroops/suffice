import { replay } from './replay.mjs';
export function subscribeToFeed(store, bus, tenant, after, onEvent) {
  if (typeof onEvent !== 'function') throw new Error('Invalid callback');
  const history = replay(store, tenant, after);
  for (const record of history) onEvent(record);
  return bus.add(tenant, onEvent);
}
