import { Suspense } from "react";
import { GainScreen } from "../../../components/instructor/GainScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function GainPage() {
  return (
    <Suspense>
      <GainScreen />
    </Suspense>
  );
}
