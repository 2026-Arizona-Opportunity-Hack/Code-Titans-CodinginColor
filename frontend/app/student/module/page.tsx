import { Suspense } from "react";
import { LessonPlayer } from "../../components/player/LessonPlayer";

// useSearchParams needs a Suspense boundary in a static export.
export default function StudentModulePage() {
  return (
    <Suspense>
      <LessonPlayer />
    </Suspense>
  );
}
