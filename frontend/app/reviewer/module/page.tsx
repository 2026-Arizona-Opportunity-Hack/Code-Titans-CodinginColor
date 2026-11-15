import { Suspense } from "react";
import { ModulePreviewScreen } from "../../components/curriculum/ModulePreviewScreen";

export default function ReviewerModulePage() {
  return <Suspense><ModulePreviewScreen base="/reviewer" roles={["reviewer", "cic_admin"]} /></Suspense>;
}
