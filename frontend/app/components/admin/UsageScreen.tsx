"use client";
import { useQuery } from "@tanstack/react-query";
import { getUsage, type Usage } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { StaffPage } from "../common/StaffPage";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "No activity yet");
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-muted">{label}</p>
    </div>
  );
}
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
      <h1>Usage</h1>
      <p className="mt-1 text-muted">How much teachers outside CIC use the curriculum. This shows counts and dates only. CIC cannot see their students or how any student is doing.</p>
      {usage.isPending ? <div role="status" aria-label="Loading usage" className="skeleton mt-6 h-40" /> : null}
      {usage.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{usage.error instanceof ApiError ? usage.error.message : "We couldn't load the usage."}</p> : null}
      {d ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="External schools" value={d.totals.schools} />
            <Stat label="Classes" value={d.totals.classes} />
            <Stat label="Students" value={d.totals.students} />
            <Stat label={`Active in the last ${d.activeWindowDays} days`} value={d.totals.studentsActiveLast7Days} />
          </div>
          {d.schools.length === 0 ? <p className="card mt-6 text-muted">No external teacher has created a class yet.</p> : <div className="mt-6 flex flex-col gap-4">{d.schools.map((s) => <School key={s.orgId} school={s} days={d.activeWindowDays} />)}</div>}
        </>
      ) : null}
    </>
  );
}
export function UsageScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
