# Tenant event feed
Repair createFeed() exported by src/index.mjs. publishBatch(tenant, events) returns committed records; subscribe(tenant, after, onEvent) replays and then receives live records, returning an unsubscribe function. history(tenant, after = 0) returns replay records.

Each event is { type, payload }. Tenant and type must be nonempty strings and payload a plain object containing structured-cloneable values. An empty batch is valid.
Records have { tenant, type, payload, sequence }. Sequence is a global monotonically increasing integer starting at 1. A successful batch is committed in input order. A later invalid event must leave history, the sequence counter and notifications untouched; a corrected retry starts with the next unconsumed sequence.
Replay and history return only records for the requested tenant with sequence strictly greater than after, in sequence order. Live subscribers receive only their tenant's records. after is a nonnegative integer and tenants must be nonempty strings. Unsubscribe is idempotent.
Inputs, publish results, history results, replay deliveries, and each individual live subscriber delivery are independently owned deep snapshots. Mutating nested payload values from any of those must not alter stored events or another subscriber's view.
Callback exceptions and callback reentrancy are outside this exercise. Preserve the public API.
