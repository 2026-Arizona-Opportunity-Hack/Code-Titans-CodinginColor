import { Suspense } from "react";
import { AddStudentScreen } from "../../../components/instructor/AddStudentScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function AddStudentPage() {
  return (
    <Suspense>
      <AddStudentScreen />
    </Suspense>
  );
}
