import { Suspense } from "react";
import { StaffLogin } from "../components/common/StaffLogin";

// useSearchParams needs a Suspense boundary in a static export.
export default function LoginPage() {
  return (
    <Suspense>
      <StaffLogin />
    </Suspense>
  );
}
