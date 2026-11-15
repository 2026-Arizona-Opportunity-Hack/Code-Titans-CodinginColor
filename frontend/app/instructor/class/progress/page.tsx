import { Suspense } from "react";
import { ProgressScreen } from "../../../components/instructor/ProgressScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function ProgressPage() {
  return (
    <Suspense>
      <ProgressScreen />
    </Suspense>
  );
}
