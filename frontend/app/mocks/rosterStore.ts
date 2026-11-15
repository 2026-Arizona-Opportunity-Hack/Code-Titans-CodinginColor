import type { RosterStudent } from "../lib/api/roster";
import { register } from "./persist";

// In-memory rosters for the fake API, so an import adds students you can then see.
// Everything resets when the page is reloaded. Mirrors backend/lambda/class-api/roster.py.

function student(classId: string, n: number, displayName: string, extra: Partial<RosterStudent> = {}): RosterStudent {
  return {
    studentId: `stu_${classId}_${n}`,
    classId,
    displayName,
    rosterNumber: n,
    externalId: null,
    status: "active",
    startModuleId: null,
    hasCredential: true,
    gradeLevel: 9 + (n % 4), // grades 9 to 12 for the demo data
    ...extra,
  };
}

const SEEDS: Record<string, () => RosterStudent[]> = {
  cls_01: () => [
    student("cls_01", 1, "Ana R."),
    student("cls_01", 2, "Ben T."),
    student("cls_01", 3, "Carla M."),
    student("cls_01", 4, "Alex Kim", { externalId: "1042" }),
    student("cls_01", 5, "Dev S."),
    student("cls_01", 6, "Sam Lee"),
    student("cls_01", 7, "Sam Lee"), // same name on purpose: shows the duplicates banner
    student("cls_01", 8, "Maya R.", { status: "inactive", hasCredential: false }),
  ],
  cls_02: () => [student("cls_02", 1, "Jo P."), student("cls_02", 2, "Ravi K."), student("cls_02", 3, "Lena W.")],
};

const rosters = new Map<string, RosterStudent[]>();

/** The class's students. A class the store has not seen (a newly created one) starts empty. */
export function getRoster(classId: string): RosterStudent[] {
  let roster = rosters.get(classId);
  if (!roster) {
    roster = SEEDS[classId]?.() ?? [];
    rosters.set(classId, roster);
  }
  return roster;
}

export function addStudent(classId: string, displayName: string, externalId: string, gradeLevel: number | null = null): RosterStudent {
  const roster = getRoster(classId);
  const number = roster.reduce((max, s) => Math.max(max, s.rosterNumber), 0) + 1;
  const created = student(classId, number, displayName, {
    externalId: externalId || null,
    gradeLevel,
    hasCredential: false, // imported students have no login words yet
  });
  roster.push(created);
  return created;
}

const WORDS = ["maple", "tiger", "blue", "river", "lemon", "ten", "cloud", "fox", "amber", "pine", "comet", "olive", "wave", "drum"];
const usedWords = new Set<string>();

/** Gives the chosen students (or every active student) new secret words, as the real server does. */
export function issueWords(classId: string, studentIds?: string[]) {
  const targets = getRoster(classId).filter((s) => s.status === "active" && (!studentIds || studentIds.includes(s.studentId)));
  return targets.map((s) => {
    let words = "";
    do {
      words = Array.from({ length: 3 }, () => WORDS[Math.floor(Math.random() * WORDS.length)]).join("-");
    } while (usedWords.has(words));
    usedWords.add(words);
    s.hasCredential = true;
    return { studentId: s.studentId, displayName: s.displayName, rosterNumber: s.rosterNumber, studentCode: words };
  });
}

register({
  key: "rosters",
  snapshot: () => ({ rosters: Object.fromEntries(rosters), used: [...usedWords] }),
  restore: (data: { rosters: Record<string, RosterStudent[]>; used: string[] }) => {
    rosters.clear();
    Object.entries(data.rosters).forEach(([classId, list]) => rosters.set(classId, list));
    usedWords.clear();
    data.used.forEach((w) => usedWords.add(w));
  },
});

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
