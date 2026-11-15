import type { NavItem } from "../components/common/StaffShell";
import type { StaffRole } from "./api/staff";

export const ROLE_LABEL: Record<StaffRole, string> = {
  cic_admin: "CIC admin",
  instructor: "Instructor",
  reviewer: "Reviewer",
};

/** The first screen each role lands on after signing in. */
export const ROLE_HOME: Record<StaffRole, string> = {
  cic_admin: "/instructor/",
  instructor: "/instructor/",
  reviewer: "/reviewer/",
};

/**
 * Sidebar items per role (docs/architecture.md section 5). Items without `ready`
 * show as disabled "Soon" until their screens are built. Curriculum covers browsing
 * and authoring for admins and instructors.
 */
export function navFor(role: StaffRole): NavItem[] {
  if (role === "reviewer") {
    return [{ label: "Curriculum", href: "/reviewer/", ready: true, icon: "book" }];
  }
  const items: NavItem[] = [
    { label: "Classes", href: "/instructor/", ready: true, icon: "classes", section: "Teach" },
    { label: "Students", href: "/instructor/students/", ready: true, icon: "students" },
    { label: "Curriculum", href: "/instructor/curriculum/", ready: true, icon: "book" },
  ];
  if (role === "cic_admin") {
    items.push(
      { label: "Cohorts", href: "/admin/cohorts/", ready: true, icon: "layers", section: "Administer" },
      { label: "Schools", href: "/admin/schools/", ready: true, icon: "school" },
      { label: "Users", href: "/admin/users/", ready: true, icon: "shield" },
      { label: "API keys", href: "/admin/api-keys/", ready: true, icon: "key" },
      { label: "Audit log", href: "/admin/audit/", ready: true, icon: "audit" },
    );
  }
  return items;
}
