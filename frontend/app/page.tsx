import Link from "next/link";
import { ApiStatus } from "./components/common/ApiStatus";
import { BrandMark } from "./components/common/BrandMark";
import { Footer } from "./components/common/Footer";
import { ResetDemo } from "./components/common/ResetDemo";
import { env } from "./config/env";

const audiences = [
  {
    title: "For students",
    text: "Open the personal link your teacher gave you. It shows exactly where to start, and you can catch up at your own pace.",
  },
  {
    title: "For teachers",
    text: "Set up a class from a spreadsheet in minutes, hand out each student's link, and see who needs a hand.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto max-w-5xl px-4 py-2">
          <BrandMark />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-16">
        <section className="rounded-3xl bg-gradient-to-br from-tint via-white to-white p-8 sm:p-14">
          <div className="rise max-w-2xl">
            <p className="badge bg-surface">Computer science for every Arizona student</p>
            <h1 className="mt-5 text-balance">Learn to code, at your own pace.</h1>
            <p className="mt-4 max-w-prose text-lg text-muted">
              Coding in Color&apos;s curriculum and progress platform. Students work through modules on their own, and
              teachers see who needs a hand.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/s/" className="btn btn-primary">
                Open my lesson
              </Link>
              <Link href="/login/" className="btn btn-secondary">
                Teacher or staff sign in
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="who-heading" className="mt-16">
          <h2 id="who-heading">Who it&apos;s for</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {audiences.map((a, i) => (
              <li key={a.title} className={`card rise ${i === 0 ? "rise-2" : "rise-3"}`}>
                <h3>{a.title}</h3>
                <p className="mt-2 text-muted">{a.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {env.useMocks ? (
          <section aria-labelledby="demo-heading" className="callout mt-16">
            <h2 id="demo-heading">Try it with fake data</h2>
            <p className="mt-1 text-muted">
              Demo mode is on, so nothing here is real. Open Maya&apos;s link to see the student side, or sign in with a demo
              account to see the teacher side.
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
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
