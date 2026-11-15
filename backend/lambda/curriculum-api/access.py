"""Who may read and who may change curriculum.

Read published modules: any signed-in staff user (admin, instructor, external teacher, reviewer).
Author (create, edit, publish, version history, images): CIC admins, and instructors an admin has made
curriculum authors with the canAuthor flag. An author can see and update every module CIC has made,
not only their own, because they work for the same organization. Instructors without the flag, external
teachers and reviewers can browse and assign published modules but never change them.
Deleting a module stays with admins and the author who created it.
"""
from cic import db
from cic.authz import Staff, require_staff
from cic.errors import Forbidden


def can_author(staff: Staff) -> bool:
    """May create and edit any module."""
    if staff.is_admin:
        return True
    if not staff.is_instructor:  # external teachers and reviewers never write
        return False
    profile = db.get_table(db.CORE).get_item(Key={"pk": f"USR#{staff.user_id}", "sk": "META"}).get("Item", {})
    return bool(profile.get("canAuthor", False))


def can_edit(staff: Staff, meta: dict) -> bool:
    """Authors can edit any module. `meta` is kept so callers read the same as before."""
    return can_author(staff)


def require_author(auth: dict) -> Staff:
    staff = require_staff(auth)
    if not can_author(staff):
        raise Forbidden("Only curriculum authors can create or change modules. Ask a CIC admin for author access")
    return staff


def require_edit(auth: dict, meta: dict) -> Staff:
    return require_author(auth)
