import Fuse from "fuse.js";
import { normalize } from "./hindi.js";
import type { Customer, Item } from "./types.js";

interface Entry<T> { key: string; ref: T }

function buildIndex<T>(rows: T[], names: (row: T) => string[]) {
  const entries: Entry<T>[] = [];
  for (const r of rows) for (const n of names(r)) if (n) entries.push({ key: normalize(n), ref: r });
  return {
    entries,
    fuse: new Fuse(entries, { keys: ["key"], threshold: 0.34, includeScore: true, ignoreLocation: true }),
  };
}

/** Best customer for a spoken name ("Rames", "ramesh bhai", "रमेश"). Returns null if nothing is close. */
export function matchCustomer(spoken: string, customers: Customer[]): Customer | null {
  const q = normalize(spoken).replace(/\b(bhai|bhaiya|ji|sahab|didi|ben|uncle|aunty)\b/g, "").trim();
  if (!q) return null;
  const idx = buildIndex(customers, (c) => [c.name, ...(c.aliases ?? [])]);
  const exact = idx.entries.find((e) => e.key === q);
  if (exact) return exact.ref;
  const hit = idx.fuse.search(q)[0];
  return hit && (hit.score ?? 1) <= 0.34 ? hit.item.ref : null;
}

export function matchItem(spoken: string, items: Item[]): Item | null {
  const q = normalize(spoken).trim();
  if (!q) return null;
  const idx = buildIndex(items, (i) => [i.name, ...(i.aliases ?? [])]);
  const exact = idx.entries.find((e) => e.key === q);
  if (exact) return exact.ref;
  const hit = idx.fuse.search(q)[0];
  return hit && (hit.score ?? 1) <= 0.34 ? hit.item.ref : null;
}
