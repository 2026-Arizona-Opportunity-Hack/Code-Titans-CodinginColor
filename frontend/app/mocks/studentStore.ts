import type { ModuleState } from "../lib/api/student";
import type { Activity, ActivityState, Question, StepResult, StudentModule } from "../lib/api/studentModule";

// In-memory student data for the fake API. The progress rules port the real server's
// (backend student-api, cic/progress.py): an activity is open when every earlier required one
// is complete; a module opens when it is the start module or the previous one is complete.

export const ORDER = ["py-intro", "py-loops", "py-functions", "py-lists"];
const START_MODULE = "py-loops";
const VIDEO = "M7lc1UVf-VE";
/** Correct choice per question. Never sent to students. */
export const KEYS: Record<string, string> = {};

const mcq = (id: string, prompt: string, choices: string[], key: string, concept: string, extra: Partial<Question> = {}): Question => {
  KEYS[id] = key;
  return { questionId: id, type: "mcq", prompt, points: 1, concept, choices: choices.map((text, i) => ({ id: "abcd"[i], text })), ...extra };
};
const base = { state: "locked" as ActivityState };
function light(moduleId: string, title: string, concept: string): StudentModule {
  return {
    moduleId, title, moduleVersion: 1, state: "available", percent: 0,
    lessons: [{ lessonId: "l1", title: "Lesson 1", activities: [
      { ...base, activityId: "a-vid", type: "video", title: "Watch", provider: "youtube", videoId: VIDEO, minSeconds: 0 },
      { ...base, activityId: "a-chk", type: "check", title: "Check your understanding", passPct: 50,
        questions: [mcq(`${moduleId}-c1`, `What is the main idea of ${title}?`, ["The right answer", "A wrong answer", "Another wrong one"], "a", concept)] },
      { ...base, activityId: "a-exit", type: "exit", title: "Exit question",
        questions: [mcq(`${moduleId}-e1`, `Which best describes ${title}?`, ["A wrong answer", "The right answer"], "b", concept)] },
    ] }],
  };
}

const pair = (suffix: string): Question[] => [
  mcq(`q-${suffix}-1`, "How many times does `for i in range(3)` repeat?", ["3 times", "2 times", "Forever", "Once"], "a", "loops", { pairKey: "p1" }),
  mcq(`q-${suffix}-2`, "Which keyword starts a loop?", ["if", "for", "def", "class"], "b", "loops", { pairKey: "p2" }),
];

const loops: StudentModule = {
  moduleId: "py-loops", title: "Python Loops", moduleVersion: 2, state: "available", percent: 0,
  lessons: [{ lessonId: "l1", title: "Repeating things", activities: [
    { ...base, activityId: "a-pre", type: "assessment", role: "pre", title: "Pretest", questions: pair("pre") },
    { ...base, activityId: "a-vid", type: "video", title: "Watch: loops", provider: "youtube", videoId: VIDEO, minSeconds: 3 },
    { ...base, activityId: "a-chk", type: "check", title: "Check your understanding", passPct: 50, questions: [
      mcq("q-chk-1", "What does `range(3)` produce?", ["0, 1, 2", "1, 2, 3", "0, 1, 2, 3", "3"], "a", "loops"),
      mcq("q-chk-2", "Which word ends a loop early?", ["stop", "break", "exit", "end"], "b", "loops"),
    ] },
    { ...base, activityId: "a-ws", type: "worksheet", title: "Worksheet", instructions: "Answer both questions. Your answers save as you type.", fields: [
      { fieldId: "f1", type: "text", prompt: "Write a loop that prints the numbers 1 to 3." },
      { fieldId: "f2", type: "number", prompt: "How many times does `range(5)` repeat?" },
    ] },
    { ...base, activityId: "a-exit", type: "exit", title: "Exit question", questions: [
      mcq("q-exit-1", "A loop that never ends is called…", ["A fast loop", "An infinite loop", "A long loop"], "b", "loops"),
    ] },
    { ...base, activityId: "a-post", type: "assessment", role: "post", title: "Post-test", questions: pair("post") },
  ] }],
};
KEYS["f2"] = "5"; // the number worksheet field has a key; f1 does not, so it goes to the teacher for review

export const DOCS: Record<string, StudentModule> = Object.fromEntries(
  [light("py-intro", "Intro to Python", "variables"), loops, light("py-functions", "Functions", "functions"), light("py-lists", "Lists", "lists")].map(
    (m) => [m.moduleId, m],
  ),
);

type Status = "complete" | "in_progress";const progress = new Map<string, Map<string, Status>>();
export const statusMap = (studentId: string) => {
  if (!progress.has(studentId)) progress.set(studentId, new Map());
  return progress.get(studentId)!;
};const activeSeconds = new Map<string, number>();
export const addSeconds = (key: string, n: number) => activeSeconds.set(key, (activeSeconds.get(key) ?? 0) + n);
export const secondsFor = (key: string) => activeSeconds.get(key) ?? 0;
const flat = (m: StudentModule): Activity[] => m.lessons.flatMap((l) => l.activities);

export function activityStates(m: StudentModule, st: Map<string, Status>): Record<string, ActivityState> {
  let blocked = false;
  const out: Record<string, ActivityState> = {};
  for (const a of flat(m)) {
    const recorded = st.get(`${m.moduleId}/${a.activityId}`);
    out[a.activityId] = recorded === "complete" ? "complete" : blocked ? "locked" : recorded === "in_progress" ? "in_progress" : "available";
    if (a.required !== false && recorded !== "complete") blocked = true;
  }
  return out;
}
const isComplete = (m: StudentModule, st: Map<string, Status>) =>
  flat(m).filter((a) => a.required !== false).every((a) => st.get(`${m.moduleId}/${a.activityId}`) === "complete");

export function moduleViews(studentId: string) {
  const st = statusMap(studentId);
  const start = ORDER.indexOf(START_MODULE);
  let previousComplete = true;
  let resume: { moduleId: string; activityId: string } | null = null;
  const views = ORDER.map((id, i) => {
    const m = DOCS[id];
    const states = activityStates(m, st);
    const required = flat(m).filter((a) => a.required !== false);
    const done = isComplete(m, st);
    const touched = Object.values(states).some((s) => s === "complete" || s === "in_progress");
    let state: ModuleState;
    if (done) state = "complete";
    else if (i < start) state = "catch_up";
    else if (i === start || previousComplete) state = touched ? "in_progress" : "available";
    else state = "locked";
    const percent = Math.round((required.filter((a) => states[a.activityId] === "complete").length / required.length) * 100);
    if (!resume && i >= start && (state === "available" || state === "in_progress")) {
      const next = flat(m).find((a) => states[a.activityId] === "available" || states[a.activityId] === "in_progress");
      if (next) resume = { moduleId: id, activityId: next.activityId };
    }
    if (i >= start) previousComplete = done;
    return { moduleId: id, title: m.title, state, percent, states };
  });
  return { views, resume };
}

/** Records the status, then works out what comes next and whether a module unlocked. */
export function commit(studentId: string, moduleId: string, activityId: string, status: Status): StepResult {
  const st = statusMap(studentId);
  const key = `${moduleId}/${activityId}`;
  const final: Status = st.get(key) === "complete" ? "complete" : status;
  st.set(key, final);
  const m = DOCS[moduleId];
  const states = activityStates(m, st);
  const next = flat(m).find((a) => states[a.activityId] === "available" || states[a.activityId] === "in_progress");
  const unlocked = isComplete(m, st) ? (ORDER[ORDER.indexOf(moduleId) + 1] ?? null) : null;
  return {
    activityState: final,
    next: next ? { type: "activity", activityId: next.activityId } : { type: "module_complete" },
    moduleUnlocked: unlocked,
  };
}

type Person = { studentId: string; displayName: string; classId: string };
const logins = new Map<string, Person>([["K7M4QX|maple-tiger-blue", { studentId: "stu_demo", displayName: "Maya R.", classId: "cls_01" }]]);
const people = new Map<string, Person>([["stu_demo", logins.get("K7M4QX|maple-tiger-blue")!]]);

/** Teacher-issued login words really sign the student in. */
export function registerLogins(classCode: string, classId: string, issued: { studentId: string; displayName: string; studentCode: string }[]) {
  for (const s of issued) {
    const person = { studentId: s.studentId, displayName: s.displayName, classId };
    logins.set(`${classCode.toUpperCase()}|${s.studentCode}`, person);
    people.set(s.studentId, person);
  }
}
export const findLogin = (code: string, words: string) => logins.get(`${code.toUpperCase()}|${words}`);
export const personFromToken = (header: string | null) => {
  const m = /^Bearer ses_mock_(.+)$/.exec(header ?? "");
  return m ? (people.get(m[1]) ?? null) : null;
};
