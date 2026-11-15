import { apiFetch } from "./client";

// Curriculum endpoints (docs/api.md section 3, backend curriculum-api). Everyone signed in can read
// published modules. Authors and admins can also list and read drafts.

export type ModuleSummary = {
  moduleId: string;
  title: string;
  /** Latest published version. 0 means it has never been published (authors only). */
  latestVersion: number;
  concepts: string[];
  estimatedMinutes: number | null;
  updatedAt: string;
  /** Authors only. */
  status?: "draft" | "published";
  hasUnpublishedChanges?: boolean;
};

export function listModules(token: string, signal?: AbortSignal): Promise<ModuleSummary[]> {
  return apiFetch<ModuleSummary[]>("/curriculum/modules", { token, signal });
}

/** Authors and admins: status=draft|published|all. */
export function listModulesFor(token: string, status: "draft" | "published" | "all", signal?: AbortSignal): Promise<ModuleSummary[]> {
  return apiFetch<ModuleSummary[]>(`/curriculum/modules?status=${status}`, { token, signal });
}

// The module document (docs/architecture.md section 6). Staff copies include answer keys.
export type DocChoice = { id: string; text: string };
export type DocQuestion = {
  questionId?: string;
  fieldId?: string;
  type: "mcq" | "multi" | "short" | "numeric" | "text";
  prompt: string;
  choices?: DocChoice[];
  /** mcq: a choice id. multi: choice ids. short: text or a list. numeric: a number or {value, tolerance}. */
  answerKey?: string | number | string[] | { value: number; tolerance?: number };
  explanation?: string;
  concept?: string;
  pairKey?: string;
  points?: number;
};
export type DocActivity = {
  activityId: string;
  type: "video" | "slides" | "check" | "worksheet" | "exit" | "assessment";
  title?: string;
  body?: string;
  required?: boolean;
  estimatedMinutes?: number;
  minSeconds?: number;
  provider?: "youtube";
  videoId?: string;
  slides?: { title?: string; body?: string }[];
  passPct?: number;
  role?: "pre" | "post";
  instructions?: string;
  questions?: DocQuestion[];
  fields?: DocQuestion[];
};
export type ModuleDoc = {
  moduleId: string;
  title: string;
  lessons: { lessonId: string; title: string; activities: DocActivity[] }[];
  /** Published copies have `version`; drafts have `revision` and `draft: true`. */
  version?: number;
  revision?: number;
  draft?: boolean;
};

/** GET /curriculum/modules/{id}: the latest published copy, with answer keys. Authors can pass draft. */
export function getModuleDoc(token: string, moduleId: string, draft = false, signal?: AbortSignal): Promise<ModuleDoc> {
  return apiFetch<ModuleDoc>(`/curriculum/modules/${encodeURIComponent(moduleId)}${draft ? "?draft=true" : ""}`, { token, signal });
}

export type ConceptTag = { concept: string; moduleCount: number };
export const listConcepts = (token: string, signal?: AbortSignal) => apiFetch<ConceptTag[]>("/curriculum/concepts", { token, signal });
