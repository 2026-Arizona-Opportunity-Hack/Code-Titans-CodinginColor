import { Suspense } from "react";
import { StudentDetailScreen } from "../../components/instructor/StudentDetailScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function StudentPage() {
  return (
    <Suspense>
      <StudentDetailScreen />
    </Suspense>
  );
}
