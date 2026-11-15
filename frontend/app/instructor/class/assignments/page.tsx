import { Suspense } from "react";
import { AssignmentsScreen } from "../../../components/instructor/AssignmentsScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function AssignmentsPage() {
  return (
    <Suspense>
      <AssignmentsScreen />
    </Suspense>
  );
}
