# Tenant inventory reservations
Repair the shop exported by src/index.mjs. createShop(initial) takes stock by tenant and SKU.
reserve({ tenant, requestId, items }) consumes stock and returns an owned receipt; stock(tenant, sku) reads the remaining integer quantity.

A logical request belongs to (tenant, requestId). Repeating it with the same items returns the original receipt without consuming stock. Requests with the same id in different tenants are independent. Reusing a logical id with different totals throws "Conflicting request".
Items must have a nonempty string sku and positive integer quantity. Duplicate SKUs combine, and item order has no semantic meaning. Receipts contain the sorted combined items and must not alias caller inputs or internal state.
Every SKU must exist for that tenant and have sufficient stock. Validate and stage the entire reservation before publishing any stock or request identity. Failure must leave all quantities and ids unchanged so a corrected retry can succeed.
The initial stock object and returned receipts are caller-owned snapshots. Preserve the API and repair the connected implementation; utilities and older code may not participate in the active path.
