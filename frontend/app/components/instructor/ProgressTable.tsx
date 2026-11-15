import Link from "next/link";
import type { ModuleState } from "../../lib/api/student";
import type { ProgressMatrix } from "../../lib/api/reports";

// Every state has a text label as well as a style, so meaning never depends on color alone.
const STATE: Record<ModuleState, { label: (percent: number) => string; badge: string }> = {
  complete: { label: () => "Complete", badge: "badge" },
  in_progress: { label: (p) => `In progress · ${p}%`, badge: "badge" },
  available: { label: () => "Not started", badge: "badge badge-muted" },
  locked: { label: () => "Locked", badge: "badge badge-muted" },
  catch_up: { label: (p) => (p > 0 ? `Catch up · ${p}%` : "Catch up"), badge: "badge badge-warn" },
};

export const studentHref = (classId: string, studentId: string) =>
  `/instructor/student/?class=${encodeURIComponent(classId)}&id=${encodeURIComponent(studentId)}`;

/** The roster by assigned modules: each cell shows the student's state, percent and minutes spent. */
export function ProgressTable({ matrix, students, classId }: { matrix: ProgressMatrix; students: ProgressMatrix["students"]; classId: string }) {
  const titleOf = (moduleId: string) => matrix.modules.find((m) => m.moduleId === moduleId)?.title ?? moduleId;

  return (
    <div className="table-wrap">
      <table className="table-brand">
        <caption className="sr-only">Student progress in each assigned module</caption>
        <thead>
          <tr>
            <th scope="col" className="font-bold">Student</th>
            {matrix.modules.map((m) => (
              <th key={m.moduleId} scope="col" className="font-bold">
                {m.title} <span className="block text-xs font-normal opacity-90">Version {m.moduleVersion}</span>
              </th>
            ))}
            <th scope="col" className="font-bold">Next step</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId}>
              <th scope="row" className="font-bold">
                <Link href={studentHref(classId, s.studentId)}>{s.displayName}</Link>{" "}
                <span className="font-normal text-muted">#{s.rosterNumber}</span>
              </th>
              {matrix.modules.map((m) => {
                const cell = s.modules[m.moduleId];
                const info = STATE[cell.state];
                return (
                  <td key={m.moduleId}>
                    <span className={info.badge}>{info.label(cell.percent)}</span>
                    {cell.state !== "complete" && cell.percent > 0 ? (
                      <progress value={cell.percent} max={100} aria-label={`${s.displayName}, ${m.title}`} className="meter mt-2" />
                    ) : null}
                    {cell.activeMinutes > 0 ? <span className="mt-1 block text-xs text-muted">{cell.activeMinutes} min</span> : null}
                  </td>
                );
              })}
              <td className="text-sm">{s.resume ? titleOf(s.resume.moduleId) : <span className="text-muted">All done</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
