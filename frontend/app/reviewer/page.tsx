import { ModuleListScreen } from "../components/curriculum/ModuleListScreen";

// Reviewers read published curriculum only. No class or student data is reachable with their token.
export default function ReviewerHomePage() {
  return <ModuleListScreen base="/reviewer" roles={["reviewer", "cic_admin"]} />;
}
