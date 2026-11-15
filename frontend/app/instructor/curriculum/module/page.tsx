import { Suspense } from "react";
import { ModulePreviewScreen } from "../../../components/curriculum/ModulePreviewScreen";
import { TEACHER_ROLES } from "../../../lib/api/staff";

export default function InstructorModulePage() {
  return <Suspense><ModulePreviewScreen base="/instructor/curriculum" roles={TEACHER_ROLES} /></Suspense>;
}
