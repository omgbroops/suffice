import { snapshot } from './snapshot.mjs';
export function createBus() {
  const subscriptions = new Set();
  return {
    add(tenant, onEvent) {
      const entry = { tenant, onEvent };
      subscriptions.add(entry);
      return () => subscriptions.delete(entry);
    },
    emit(record) {
      for (const entry of subscriptions) entry.onEvent(snapshot(record));
    },
  };
}
