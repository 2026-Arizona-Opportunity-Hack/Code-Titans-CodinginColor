import { StaffShell, type NavItem } from "../../components/common/StaffShell";

// Static LAYOUT PREVIEW with sample data, not a working screen. Real instructor
// pages are built in a later phase. Unbuilt nav items show as disabled "Soon".
const nav: NavItem[] = [
  { label: "Classes", href: "/design/staff/", ready: true },
  { label: "Curriculum", href: "/instructor/curriculum/" },
  { label: "Author", href: "/author/" },
];

const stats = [
  { label: "Enrolled", value: "28" },
  { label: "Completion", value: "64%" },
  { label: "Average gain", value: "+32.6 pts" },
  { label: "Needs attention", value: "5" },
];

const students = [
  { name: "Ana R.", number: 4, module: "Python Loops", status: "In progress", percent: "33%" },
  { name: "Ben T.", number: 9, module: "Python Loops", status: "Stuck", percent: "17%" },
  { name: "Carla M.", number: 11, module: "Functions", status: "Complete", percent: "100%" },
  { name: "Dev S.", number: 14, module: "Python Loops", status: "Not started", percent: "0%" },
];

export default function StaffLayoutPreview() {
  return (
    <StaffShell items={nav} userName="Jordan Lee" roleLabel="Instructor">
      <p className="mb-4 text-sm text-muted">Layout preview with sample data.</p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Period 3 · Maryvale</h1>
          <p className="text-muted">Class code K7M4QX</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary">
            Add late student
          </button>
          <button type="button" className="btn btn-secondary">
            Login sheet
          </button>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 text-3xl font-bold text-brand">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="progress-heading" className="mt-10">
        <h2 id="progress-heading" className="mb-3 text-xl">
          Student progress
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Student progress for this class</caption>
            <thead className="bg-brand text-on-brand">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">Student</th>
                <th scope="col" className="px-4 py-3 font-bold">Module</th>
                <th scope="col" className="px-4 py-3 font-bold">Status</th>
                <th scope="col" className="px-4 py-3 font-bold">Progress</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.number} className="even:bg-tint">
                  <th scope="row" className="px-4 py-3 font-bold">
                    {s.name} <span className="font-normal text-muted">#{s.number}</span>
                  </th>
                  <td className="px-4 py-3">{s.module}</td>
                  <td className="px-4 py-3">{s.status}</td>
                  <td className="px-4 py-3">{s.percent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </StaffShell>
  );
}
