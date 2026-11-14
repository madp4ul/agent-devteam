export function uniqueMenuEntries<T extends { id: string }>(entries: T[]): T[] {
  const retained = new Map<string, T>();
  for (const entry of entries) if (!retained.has(entry.id)) retained.set(entry.id, entry);
  return [...retained.values()];
}

/** Keep previously requested results displaced by a newer first page. Inputs are terminal results only. */
export function retainOlderMenuEntries<T extends { id: string }>(latest: T[], previous: T[], older: T[]): T[] {
  if (!older.length) return older;
  const currentIds = new Set(latest.map((entry) => entry.id));
  return uniqueMenuEntries([...previous, ...older]).filter((entry) => !currentIds.has(entry.id));
}
