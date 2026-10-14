import { createStore } from './event-store.mjs';
import { createBus } from './live-bus.mjs';
import { publish } from './publisher.mjs';
import { subscribeToFeed } from './subscription.mjs';
import { replay } from './replay.mjs';
export function createFeed() {
  const store = createStore();
  const bus = createBus();
  return {
    publishBatch: (tenant, events) => publish(store, bus, tenant, events),
    subscribe: (tenant, after, onEvent) => subscribeToFeed(store, bus, tenant, after, onEvent),
    history: (tenant, after = 0) => replay(store, tenant, after),
  };
}
