import { Suspense } from "react";
import { ModulePreviewScreen } from "../../../components/curriculum/ModulePreviewScreen";

export default function InstructorModulePage() {
  return <Suspense><ModulePreviewScreen base="/instructor/curriculum" roles={["instructor", "cic_admin"]} /></Suspense>;
}
