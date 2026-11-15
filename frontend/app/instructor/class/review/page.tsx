import { Suspense } from "react";
import { ReviewQueueScreen } from "../../../components/instructor/ReviewQueueScreen";

// useSearchParams needs a Suspense boundary in a static export.
export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewQueueScreen />
    </Suspense>
  );
}
