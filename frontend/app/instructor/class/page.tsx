import { Suspense } from "react";
import { ClassPage as ClassScreen } from "../../components/instructor/ClassPage";

// useSearchParams needs a Suspense boundary in a static export.
export default function ClassPage() {
  return (
    <Suspense>
      <ClassScreen />
    </Suspense>
  );
}
