"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { listModules } from "../../lib/api/curriculum";
import { getClass, TEACHER_ROLES } from "../../lib/api/staff";
import { Icon, type IconName } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
import { QuickAddStudent } from "./QuickAddStudent";
import { RosterSection } from "./RosterSection";

// The class page: name, class code, student count and the roster. Progress and
// assignments are added in later steps.
type Tool = { label: string; description: string; path: string; icon: IconName };

const MANAGE: Tool[] = [
  { label: "Login sheet", description: "Print each student's link and secret words.", path: "login-sheet", icon: "printer" },
  { label: "Assigned modules", description: "Choose what the class works on, and in what order.", path: "assignments", icon: "layers" },
  { label: "Class settings", description: "Rename the class and tune the stuck alerts.", path: "settings", icon: "sliders" },
];

const INSIGHTS: Tool[] = [
  { label: "Progress", description: "Where every student is, module by module.", path: "progress", icon: "chart" },
  { label: "Learning gain", description: "Pretest to post-test improvement.", path: "gain", icon: "trending" },
  { label: "Concepts", description: "Which ideas the class has and hasn't got.", path: "concepts", icon: "target" },
  { label: "Worksheets to review", description: "Written answers waiting for your feedback.", path: "review", icon: "review" },
  { label: "Hints and struggles", description: "What students asked the AI tutor about, and what to reteach.", path: "hints", icon: "info" },
  { label: "Gradebook", description: "Every student's scores, gain and hints. Download as CSV.", path: "gradebook", icon: "spreadsheet" },
];

function ToolGrid({ title, tools, classId, wide }: { title: string; tools: Tool[]; classId: string; wide?: boolean }) {
  return (
    <section aria-label={title} className="mt-10">
      <h2 className="eyebrow mb-3 !text-sm">{title}</h2>
      <ul className={`grid gap-4 sm:grid-cols-2 ${wide ? "" : "xl:grid-cols-3"}`}>
        {tools.map((tool) => (
          <li key={tool.path} className="card card-interactive relative flex items-start gap-4 !p-4">
            <span className="icon-tile">
              <Icon name={tool.icon} className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="!text-base">
                <Link href={`/instructor/class/${tool.path}/?id=${encodeURIComponent(classId)}`} className="no-underline after:absolute after:inset-0">
                  {tool.label}
                </Link>
              </h3>
              <p className="mt-0.5 text-sm text-muted">{tool.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClassPageBody({ token, classId }: { token: string; classId: string }) {
  const item = useQuery({
    queryKey: ["class", token, classId],
    queryFn: ({ signal }) => getClass(token, classId, signal),
    enabled: Boolean(classId),
    retry: false,
  });
  // Where students who join late start (their change: the class's current module).
  const modules = useQuery({ queryKey: ["modules", token], queryFn: ({ signal }) => listModules(token, signal), retry: false });
  const startId = item.data?.currentModuleId ?? null;
  const startTitle = startId ? (modules.data?.find((m) => m.moduleId === startId)?.title ?? startId) : null;
  const id = encodeURIComponent(classId);
  return (
    <>
      {item.isPending ? (
        <div role="status" aria-label="Loading the class" className="space-y-4">
          <div className="skeleton h-10 w-1/3" />
          <div className="skeleton h-24" />
        </div>
      ) : null}
      {item.isError ? (
        <div role="alert" className="callout callout-danger">
          <Link href="/instructor/" className="crumbs">
            <Icon name="arrowLeft" className="size-4" />
            Your classes
          </Link>
          <p className="font-bold text-danger">
            {item.error instanceof ApiError ? item.error.message : "We couldn't load this class."}
          </p>
        </div>
      ) : null}
      {item.data ? (
        <>
          <PageHeader
            back={{ href: "/instructor/", label: "Your classes" }}
            title={item.data.name}
            meta={
              <>
                <span>
                  Class code{" "}
                  <span className="ml-1 rounded-md bg-tint px-2 py-0.5 font-mono font-bold text-brand">{item.data.joinCode}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="badge badge-dot">
                  {item.data.counts.students} {item.data.counts.students === 1 ? "student" : "students"}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Students who join late start at:{" "}
                  <strong className="text-ink">{startTitle ?? "the first module (none chosen)"}</strong>
                  {" · "}
                  <Link href={`/instructor/class/assignments/?id=${id}`}>Change</Link>
                </span>
              </>
            }
            actions={
              <>
                {item.data ? <QuickAddStudent token={token} classId={classId} classCode={item.data.joinCode} schoolName={item.data.schoolName} /> : null}
                <Link href={`/instructor/class/add-student/?id=${id}`} className="btn btn-secondary">
                  <Icon name="userPlus" className="size-5" />
                  Add a student who joined late
                </Link>
                <Link href={`/instructor/class/import/?id=${id}`} className="btn btn-primary">
                  <Icon name="upload" className="size-5" />
                  Add students from a CSV
                </Link>
              </>
            }
          />
          <ToolGrid title="Insights" tools={INSIGHTS} classId={classId} wide />
          <ToolGrid title="Manage" tools={MANAGE} classId={classId} />
          <RosterSection token={token} classId={classId} />
        </>
      ) : null}
    </>
  );
}

export function ClassPage() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={TEACHER_ROLES}>
      {({ token }) => <ClassPageBody token={token} classId={classId} />}
    </StaffPage>
  );
}
