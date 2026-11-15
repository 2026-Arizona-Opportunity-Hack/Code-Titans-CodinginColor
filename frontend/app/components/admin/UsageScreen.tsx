"use client";
import { useQuery } from "@tanstack/react-query";
import { getUsage, type Usage } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { StatGrid } from "../common/StatGrid";
import { PageHeader } from "../common/PageHeader";
import { Icon } from "../common/Icon";
import { StaffPage } from "../common/StaffPage";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "No activity yet");
function School({ school, days }: { school: Usage["schools"][number]; days: number }) {
  return (
    <section aria-labelledby={`usage-${school.orgId}`} className="card">
      <h2 id={`usage-${school.orgId}`} className="text-lg">{school.name}</h2>
      <p className="text-muted">Teachers: {school.teachers.join(", ") || "none yet"} · Last activity: {day(school.lastActivityAt)}</p>
      <div className="table-wrap mt-4">
        <table className="table-brand">
          <caption className="sr-only">Classes at {school.name}</caption>
          <thead><tr><th scope="col">Class</th><th scope="col">Teacher</th><th scope="col">Students</th><th scope="col">Modules assigned</th><th scope="col">Active in the last {days} days</th><th scope="col">Last activity</th></tr></thead>
          <tbody>{school.classList.map((c) => (
            <tr key={c.name + c.createdAt}>
              <th scope="row">{c.name}{c.status === "archived" ? <span className="badge badge-muted ml-2">Archived</span> : null}</th>
              <td>{c.teachers.join(", ") || "—"}</td>
              <td>{c.students}</td>
              <td>{c.modulesAssigned}</td>
              <td>{c.studentsActiveLast7Days}</td>
              <td>{day(c.lastActivityAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
function Body({ token }: { token: string }) {
  const usage = useQuery({ queryKey: ["usage", token], queryFn: ({ signal }) => getUsage(token, signal), retry: false, refetchOnMount: "always" });
  const d = usage.data;
  return (
    <>
      <PageHeader title="Usage" description="How much teachers outside CIC use the curriculum. This shows counts and dates only. CIC cannot see their students or how any student is doing." />
      {usage.isPending ? <div role="status" aria-label="Loading usage" className="skeleton mt-6 h-40" /> : null}
      {usage.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{usage.error instanceof ApiError ? usage.error.message : "We couldn't load the usage."}</p> : null}
      {d ? (
        <>
          <StatGrid
            className="mt-6"
            items={[
              { label: "External schools", value: d.totals.schools, icon: "school" },
              { label: "Classes", value: d.totals.classes, icon: "classes" },
              { label: "Students", value: d.totals.students, icon: "students" },
              { label: `Active in the last ${d.activeWindowDays} days`, value: d.totals.studentsActiveLast7Days, icon: "trending" },
            ]}
          />
          {d.schools.length === 0 ? <div className="empty mt-6">
              <span className="icon-tile"><Icon name="school" className="size-6" /></span>
              <h2 className="text-lg">No external classes yet</h2>
              <p className="max-w-md text-muted">Usage appears here once an approved external teacher creates a class.</p>
            </div> : <div className="mt-6 flex flex-col gap-4">{d.schools.map((s) => <School key={s.orgId} school={s} days={d.activeWindowDays} />)}</div>}
        </>
      ) : null}
    </>
  );
}
export function UsageScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
