import Link from "next/link";
import { ApiStatus } from "./components/common/ApiStatus";
import { BrandMark } from "./components/common/BrandMark";
import { Footer } from "./components/common/Footer";
import { env } from "./config/env";

// Temporary home page. The real landing and student/staff entry screens replace it
// in the next phases. The links below open the layout previews.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-2 border-brand bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <BrandMark />
        </div>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-12">
        <section>
          <h1 className="text-4xl">Learn to code, at your own pace.</h1>
          <p className="mt-3 max-w-prose text-lg text-muted">
            Coding in Color&apos;s curriculum and progress platform: students work through modules on
            their own, and teachers see who needs a hand.
          </p>
        </section>

        <section aria-labelledby="previews-heading" className="rounded-xl bg-tint p-6">
          <h2 id="previews-heading" className="text-xl">
            Layout previews
          </h2>
          <p className="mt-1 text-muted">Temporary pages that show the two page frames with sample content.</p>
          <ul className="mt-4 flex flex-wrap gap-3">
            <li>
              <Link href="/design/student/" className="btn btn-primary">
                Student layout
              </Link>
            </li>
            <li>
              <Link href="/design/staff/" className="btn btn-secondary">
                Staff layout
              </Link>
            </li>
          </ul>
        </section>

        {env.useMocks ? (
          <section aria-labelledby="demo-heading" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="demo-heading" className="text-xl">
              Try the student flow (fake data)
            </h2>
            <p className="mt-1 text-muted">
              Opens Maya&apos;s personal link. Or open the entry page and type class code K7M4QX with secret words
              maple-tiger-blue.
            </p>
            <ul className="mt-4 flex flex-wrap gap-3">
              <li>
                <Link href="/s/#K7M4QX.maple-tiger-blue" className="btn btn-primary">
                  Open Maya&apos;s link
                </Link>
              </li>
              <li>
                <Link href="/s/" className="btn btn-secondary">
                  Student entry page
                </Link>
              </li>
            </ul>
          </section>
        ) : null}

        {env.useMocks ? (
          <section aria-labelledby="staff-demo-heading" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="staff-demo-heading" className="text-xl">
              Try the instructor flow (fake data)
            </h2>
            <p className="mt-1 text-muted">Sign in with a demo account, see your classes, and create a new one.</p>
            <p className="mt-4">
              <Link href="/login/" className="btn btn-primary">
                Staff sign in
              </Link>
            </p>
          </section>
        ) : null}

        <section aria-labelledby="status-heading" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="status-heading" className="mb-3 text-xl">
            Status
          </h2>
          <ApiStatus />
        </section>
      </main>

      <Footer />
    </div>
  );
}
