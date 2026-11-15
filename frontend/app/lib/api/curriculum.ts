import { apiFetch, apiFetchAll } from "./client";

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
  /** Authors only: the user who created it. Only they or an admin can delete it. */
  createdBy?: string;
  /** Authors only: whether the caller may open and change this module. */
  canEdit?: boolean;
};

export function listModules(token: string, signal?: AbortSignal): Promise<ModuleSummary[]> {
  return apiFetchAll<ModuleSummary>("/curriculum/modules", { token, signal });
}

/** Authors and admins: status=draft|published|all. */
export function listModulesFor(token: string, status: "draft" | "published" | "all", signal?: AbortSignal): Promise<ModuleSummary[]> {
  return apiFetchAll<ModuleSummary>(`/curriculum/modules?status=${status}`, { token, signal });
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
/** A test for a coding exercise. "call" evaluates `expression` after the student's code and compares the result. "output" runs the program with `stdin` and compares what it prints. */
export type DocCodeTest = { testId: string; label: string; kind: "output" | "call"; stdin?: string; expression?: string; expected: string };
export type DocActivity = {
  activityId: string;
  type: "video" | "slides" | "check" | "worksheet" | "exit" | "assessment" | "code";
  title?: string;
  body?: string;
  required?: boolean;
  estimatedMinutes?: number;
  minSeconds?: number;
  provider?: "youtube";
  videoId?: string;
  slides?: { title?: string; body?: string }[];
  /** A PDF or Google Slides deck shown instead of typed slides. */
  document?: import("../slideDocument").SlideDocument;
  passPct?: number;
  role?: "pre" | "post";
  instructions?: string;
  questions?: DocQuestion[];
  fields?: DocQuestion[];
  /** Coding exercises. `solution` stays on the server and is never sent to students. */
  language?: "python";
  starterCode?: string;
  solution?: string;
  tests?: DocCodeTest[];
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

// Authoring: authors and admins only.
export type Problem = { path: string; message: string };
/** Problems the server lists when a save or publish is refused (ApiError.details). */
export const problemsOf = (details: unknown): Problem[] =>
  Array.isArray(details) ? details.filter((d): d is Problem => typeof d?.path === "string" && typeof d?.message === "string") : [];

/** POST /curriculum/modules: a new draft seeded with the standard structure. */
export const createModule = (token: string, body: { title: string; template: "standard" }) =>
  apiFetch<ModuleDoc>("/curriculum/modules", { method: "POST", token, body });

/** PUT /curriculum/modules/{id}/draft: saves the whole document. 409 REVISION_CONFLICT if someone saved first. */
export const saveDraft = (token: string, moduleId: string, doc: ModuleDoc, revision: number) =>
  apiFetch<{ revision: number; updatedAt: string }>(`/curriculum/modules/${encodeURIComponent(moduleId)}/draft`, {
    method: "PUT", token, body: doc, ifMatch: revision,
  });

/** POST /curriculum/modules/{id}/publish: validates, then creates the next immutable version. */
export const publishModule = (token: string, moduleId: string) =>
  apiFetch<{ moduleId: string; version: number; publishedAt: string; classesUpdated?: number }>(`/curriculum/modules/${encodeURIComponent(moduleId)}/publish`, { method: "POST", token });

export const listVersions = (token: string, moduleId: string, signal?: AbortSignal) =>
  apiFetch<{ version: number; publishedAt: string; publishedBy: string }[]>(`/curriculum/modules/${encodeURIComponent(moduleId)}/versions`, { token, signal });

/** GET /curriculum/modules/{id}/versions/{version}: one published version, with answer keys. */
export const getVersionDoc = (token: string, moduleId: string, version: number, signal?: AbortSignal) =>
  apiFetch<ModuleDoc>(`/curriculum/modules/${encodeURIComponent(moduleId)}/versions/${version}`, { token, signal });

/** DELETE /curriculum/modules/{id}: removes every draft and version. 409 MODULE_IN_USE while a class has it assigned. */
export const deleteModule = (token: string, moduleId: string) =>
  apiFetch<{ moduleId: string; deleted: boolean }>(`/curriculum/modules/${encodeURIComponent(moduleId)}`, { method: "DELETE", token });
