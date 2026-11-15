import { ModuleListScreen } from "../../components/curriculum/ModuleListScreen";

export default function InstructorCurriculumPage() {
  return <ModuleListScreen base="/instructor/curriculum" roles={["instructor", "cic_admin"]} />;
}
