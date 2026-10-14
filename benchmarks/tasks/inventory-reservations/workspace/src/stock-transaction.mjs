import { consume } from './stock-rules.mjs';
export function commitStock(repository, tenant, items) {
  const staged = repository.current();
  for (const item of items) consume(staged, tenant, item);
  repository.publish(staged);
}
