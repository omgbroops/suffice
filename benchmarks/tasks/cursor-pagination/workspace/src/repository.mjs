export function createRepository(rows) {
  return {
    async page({ cursor = null, limit = 2 } = {}) {
      const remaining = rows.filter(row => cursor === null || row.id >= cursor);
      const scanned = remaining.slice(0, limit);
      return { items: scanned.filter(row => !row.deleted), nextCursor: remaining.length > scanned.length ? scanned.at(-1).id : null };
    }
  };
}
