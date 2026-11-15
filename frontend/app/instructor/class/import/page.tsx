import { Suspense } from "react";
import { RosterImportWizard } from "../../../components/instructor/RosterImportWizard";

// useSearchParams needs a Suspense boundary in a static export.
export default function RosterImportPage() {
  return (
    <Suspense>
      <RosterImportWizard />
    </Suspense>
  );
}
