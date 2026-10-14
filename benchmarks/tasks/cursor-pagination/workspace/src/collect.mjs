export async function collectAll(repository, { limit = 2, maxPages = 100 } = {}) {
  const items = []; const seen = new Set(); let cursor = null;
  for (let n = 0; n < maxPages; n++) {
    const page = await repository.page({ cursor, limit });
    items.push(...page.items);
    if (page.items.length < limit || page.nextCursor === null) return items;
    if (seen.has(page.nextCursor)) throw new Error('Repeated cursor');
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
  throw new Error('Page budget exhausted');
}
