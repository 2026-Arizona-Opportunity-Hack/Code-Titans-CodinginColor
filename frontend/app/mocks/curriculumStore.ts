import type { ModuleSummary } from "../lib/api/curriculum";
import { register } from "./persist";

// The fake curriculum list, shared by the curriculum and assignment handlers.
const UPDATED = "2026-10-01T00:00:00Z";
const mod = (moduleId: string, title: string, latestVersion: number, concept: string, estimatedMinutes: number): ModuleSummary => ({
  moduleId, title, latestVersion, concepts: [concept], estimatedMinutes, updatedAt: UPDATED, status: "published", hasUnpublishedChanges: false,
});

export const MODULES: ModuleSummary[] = [
  mod("py-intro", "Intro to Python", 1, "variables", 30),
  mod("py-loops", "Python Loops", 2, "loops", 45),
  mod("py-functions", "Functions", 1, "functions", 45),
  mod("py-lists", "Lists", 1, "lists", 40),
];

register({ key: "modules", snapshot: () => MODULES, restore: (d: ModuleSummary[]) => MODULES.splice(0, MODULES.length, ...d) });
