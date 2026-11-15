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
    return [{ label: "Curriculum", href: "/reviewer/", ready: true }];
  }
  const items: NavItem[] = [
    { label: "Classes", href: "/instructor/", ready: true },
    { label: "Students", href: "/instructor/students/", ready: true },
    { label: "Curriculum", href: "/instructor/curriculum/", ready: true },
  ];
  if (role === "cic_admin") {
    items.push(
      { label: "Cohorts", href: "/admin/cohorts/", ready: true },
      { label: "Schools", href: "/admin/schools/", ready: true },
      { label: "Users", href: "/admin/users/", ready: true },
      { label: "API keys", href: "/admin/api-keys/", ready: true },
      { label: "Audit log", href: "/admin/audit/", ready: true },
    );
  }
  return items;
}
