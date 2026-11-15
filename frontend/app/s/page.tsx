import { Suspense } from "react";
import { StudentEntry } from "../components/player/StudentEntry";

// Student entry: opens a personal link (/s/#<classCode>.<words>) or shows a typed
// fallback. useSearchParams needs a Suspense boundary in a static export.
export default function StudentEntryPage() {
  return (
    <Suspense>
      <StudentEntry />
    </Suspense>
  );
}
