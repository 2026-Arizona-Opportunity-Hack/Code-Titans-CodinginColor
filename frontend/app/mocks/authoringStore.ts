import type { ModuleDoc } from "../lib/api/curriculum";
import { staffDoc } from "./curriculumHandlers";
import { register } from "./persist";

// Drafts and published copies for the fake authoring API. A seeded module gets a draft the first
// time it is opened for editing, copied from its published version.
type Entry = { doc: ModuleDoc; revision: number; publishedRevision: number; versions: { version: number; publishedAt: string; doc: ModuleDoc }[] };
const entries = new Map<string, Entry>();
register({
  key: "authoring",
  snapshot: () => [...entries],
  restore: (d: [string, Entry][]) => { entries.clear(); d.forEach(([k, v]) => entries.set(k, v)); },
});

export function draftOf(moduleId: string): Entry | null {
  const existing = entries.get(moduleId);
  if (existing) return existing;
  const doc = staffDoc(moduleId);
  if (!doc) return null;
  const { version, ...rest } = doc;
  const entry: Entry = { doc: rest, revision: 1, publishedRevision: 1, versions: [{ version: version ?? 1, publishedAt: "2026-10-01T00:00:00Z", doc }] };
  entries.set(moduleId, entry);
  return entry;
}
export const newEntry = (moduleId: string, doc: ModuleDoc) => entries.set(moduleId, { doc, revision: 1, publishedRevision: 0, versions: [] });
export const hasEntry = (moduleId: string) => entries.has(moduleId);

/** The latest published copy of an authored module, or null when it was never edited here. */
export function publishedDoc(moduleId: string): ModuleDoc | null {
  const v = entries.get(moduleId)?.versions.at(-1);
  return v ? { ...v.doc, version: v.version } : null;
}
