import { Suspense } from "react";
import { LoginSheetScreen } from "../../../components/instructor/LoginSheetScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function LoginSheetPage() {
  return (
    <Suspense>
      <LoginSheetScreen />
    </Suspense>
  );
}
