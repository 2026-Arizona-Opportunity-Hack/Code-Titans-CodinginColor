import type { RosterStudent } from "../lib/api/roster";

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

export function addStudent(classId: string, displayName: string, externalId: string): RosterStudent {
  const roster = getRoster(classId);
  const number = roster.reduce((max, s) => Math.max(max, s.rosterNumber), 0) + 1;
  const created = student(classId, number, displayName, {
    externalId: externalId || null,
    hasCredential: false, // imported students have no login words yet
  });
  roster.push(created);
  return created;
}

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
