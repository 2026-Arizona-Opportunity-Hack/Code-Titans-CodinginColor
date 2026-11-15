"""Who may read and who may change curriculum.

Read published modules: any signed-in staff user (admin, instructor, reviewer).
Create modules and upload images: admins and every instructor.
Edit, publish, see versions of, or delete a module: admins, the instructor who created it,
and instructors an admin gave the canAuthor flag ("can edit all curriculum"), who can edit
anyone's module. Deleting stays with admins and the creator.
Reviewers never write, whatever the flag says.
"""
from cic import db
from cic.authz import Staff, require_staff
from cic.errors import Forbidden


def can_author(staff: Staff) -> bool:
    """May create modules (and so has an authoring view)."""
    return staff.is_admin or staff.is_instructor


def can_edit_all(staff: Staff) -> bool:
    """May edit any module, not only their own."""
    if staff.is_admin:
        return True
    if not staff.is_instructor:
        return False
    profile = db.get_table(db.CORE).get_item(Key={"pk": f"USR#{staff.user_id}", "sk": "META"}).get("Item", {})
    return bool(profile.get("canAuthor", False))


def can_edit(staff: Staff, meta: dict) -> bool:
    return can_author(staff) and (meta.get("createdBy") == staff.user_id or can_edit_all(staff))


def require_author(auth: dict) -> Staff:
    staff = require_staff(auth)
    if not can_author(staff):
        raise Forbidden("You do not have permission to create curriculum")
    return staff


def require_edit(auth: dict, meta: dict) -> Staff:
    staff = require_author(auth)
    if not can_edit(staff, meta):
        raise Forbidden("You can only edit modules you created. Ask a CIC admin for access to this one")
    return staff
