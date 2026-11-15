import Link from "next/link";
import { ApiStatus } from "./components/common/ApiStatus";
import { BrandMark } from "./components/common/BrandMark";
import { Footer } from "./components/common/Footer";
import { Icon, type IconName } from "./components/common/Icon";
import { ResetDemo } from "./components/common/ResetDemo";
import { env } from "./config/env";

const steps: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "spreadsheet",
    title: "Teachers set up a class",
    text: "Upload the class list from a spreadsheet, pick the modules, and print each student's login. It takes minutes, with no training on the content.",
  },
  {
    icon: "key",
    title: "Students open their link",
    text: "A class code and three secret words. No email address, no password to forget, and nothing personal collected.",
  },
  {
    icon: "trending",
    title: "Everyone sees the progress",
    text: "Students always know where to start. Teachers see who needs a hand, and how much each class learned.",
  },
];

const audiences: { icon: IconName; title: string; points: string[] }[] = [
  {
    icon: "graduation",
    title: "For students",
    points: [
      "Short lessons: watch, check, practice, then a quick exit question",
      "Joined late? You land at the right module and catch up at your own pace",
      "Stuck? Ask for a hint that nudges you without giving the answer away",
    ],
  },
  {
    icon: "classes",
    title: "For teachers",
    points: [
      "The platform teaches, so you manage the class instead of the lesson",
      "See who is stuck or hasn't started, and which ideas the class hasn't got yet",
      "Pretest to post-test learning gain for every student and class",
    ],
  },
];

/** A static picture of the student's path. Decorative only, so it is hidden from screen readers. */
function PathPreview() {
  const rows = [
    { title: "Python Loops", note: "Complete", state: "done" },
    { title: "Functions", note: "In progress · 60%", state: "now" },
    { title: "Lists", note: "Locked", state: "locked" },
  ] as const;
  return (
    <div aria-hidden="true" className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-tint to-white" />
      <div className="card !p-5 shadow-[var(--shadow-lg)] sm:!p-6">
        <p className="eyebrow">Your learning path</p>
        <p className="mt-1 text-lg font-bold text-ink">1 of 3 modules complete</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-tint">
          <div className="h-full w-1/3 rounded-full bg-brand" />
        </div>
        <ol className="mt-5 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.title} className={`flex items-center gap-3 rounded-xl border p-3 ${r.state === "locked" ? "border-hairline bg-wash" : "border-hairline bg-surface"}`}>
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full ${
                  r.state === "done" ? "bg-brand text-on-brand" : r.state === "now" ? "bg-tint text-brand" : "bg-white text-muted ring-1 ring-hairline"
                }`}
              >
                <Icon name={r.state === "done" ? "check" : r.state === "now" ? "play" : "lock"} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className={`block font-bold ${r.state === "locked" ? "text-muted" : "text-ink"}`}>{r.title}</span>
                <span className="text-sm text-muted">{r.note}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-tint px-4 py-3 text-sm font-bold text-brand">
          <Icon name="target" className="size-5" />
          Next up: finish step 3 of Functions
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <BrandMark />
          <nav aria-label="Sign in" className="flex items-center gap-2">
            <Link href="/login/" className="btn btn-ghost btn-sm">
              Teacher sign in
            </Link>
            <Link href="/s/" className="btn btn-primary btn-sm">
              Open my lesson
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="rise">
            <p className="badge badge-dot bg-tint">Computer science for every Arizona student</p>
            <h1 className="mt-5 text-balance !text-[clamp(2.25rem,1.6rem+3vw,3.75rem)] !leading-[1.05]">
              Learn to code, at your own pace.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted sm:text-xl">
              Coding in Color&apos;s curriculum and progress platform. Students work through modules on their own, and
              teachers see who needs a hand.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/s/" className="btn btn-primary !min-h-12 px-7 text-base">
                Open my lesson
                <Icon name="arrowRight" />
              </Link>
              <Link href="/login/" className="btn btn-secondary !min-h-12 px-7 text-base">
                Teacher or staff sign in
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted">
              {["No student emails or passwords", "Works on a Chromebook or a phone", "Short, self-paced lessons"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check" className="size-4 text-brand" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rise rise-2 mx-auto w-full max-w-md lg:max-w-none">
            <PathPreview />
          </div>
        </section>

        <section aria-labelledby="how-heading" className="border-y border-hairline bg-wash">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading" className="mt-1 max-w-2xl">
              From a class list to a class that is learning
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="card rise relative !p-6" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="icon-tile">
                    <Icon name={s.icon} className="size-6" />
                  </span>
                  <p className="mt-4 text-sm font-bold text-muted">Step {i + 1}</p>
                  <h3 className="mt-0.5">{s.title}</h3>
                  <p className="mt-2 text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="who-heading" className="mx-auto max-w-6xl px-4 py-16">
          <p className="eyebrow">Built for the classroom</p>
          <h2 id="who-heading" className="mt-1">
            Who it&apos;s for
          </h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-2">
            {audiences.map((a) => (
              <li key={a.title} className="card !p-7">
                <div className="flex items-center gap-3">
                  <span className="icon-tile">
                    <Icon name={a.icon} className="size-6" />
                  </span>
                  <h3 className="!text-xl">{a.title}</h3>
                </div>
                <ul className="mt-5 flex flex-col gap-3">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <Icon name="check" className="mt-1 size-4 text-brand" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        {env.useMocks ? (
          <section aria-labelledby="demo-heading" className="mx-auto max-w-6xl px-4 pb-16">
            <div className="callout">
              <h2 id="demo-heading">Try it with fake data</h2>
              <p className="mt-1 text-muted">
                Demo mode is on, so nothing here is real. Open Maya&apos;s link to see the student side, or sign in with a
                demo account to see the teacher side.
              </p>
              <ul className="mt-4 flex flex-wrap gap-3">
                <li>
                  <Link href="/s/#K7M4QX.maple-tiger-blue" className="btn btn-primary">
                    Open Maya&apos;s link
                  </Link>
                </li>
                <li>
                  <Link href="/login/" className="btn btn-secondary">
                    Staff sign in
                  </Link>
                </li>
                <li>
                  <ResetDemo />
                </li>
              </ul>
              <div className="mt-4 text-sm">
                <ApiStatus />
              </div>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="cta-heading" className="bg-brand text-on-brand">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12">
            <div>
              <h2 id="cta-heading" className="!text-on-brand">
                Ready to start learning?
              </h2>
              <p className="mt-1 max-w-xl text-white/90">
                Coding in Color is a 501(c)(3) nonprofit developing the future digital workforce through computer science and AI
                education in Arizona.
              </p>
            </div>
            <Link href="/s/" className="btn !min-h-12 bg-white px-7 text-base text-brand hover:!bg-tint hover:!text-brand-hover">
              Open my lesson
              <Icon name="arrowRight" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
