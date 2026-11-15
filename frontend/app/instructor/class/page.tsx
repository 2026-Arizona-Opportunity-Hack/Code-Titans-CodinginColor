import { Suspense } from "react";
import { ClassPlaceholder } from "../../components/instructor/ClassPlaceholder";

// useSearchParams needs a Suspense boundary in a static export.
export default function ClassPage() {
  return (
    <Suspense>
      <ClassPlaceholder />
    </Suspense>
  );
}
