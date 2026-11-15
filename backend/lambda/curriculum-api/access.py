"""Who may read and who may change curriculum.

Read: any signed-in staff user (admin, instructor, reviewer).
Write: administrators, and instructors an administrator has given the canAuthor flag.
Reviewers never write, whatever the flag says.
"""
from cic import db
from cic.authz import Staff, require_staff
from cic.errors import Forbidden


def can_author(staff: Staff) -> bool:
    if staff.is_admin:
        return True
    if not staff.is_instructor:
        return False
    profile = db.get_table(db.CORE).get_item(Key={"pk": f"USR#{staff.user_id}", "sk": "META"}).get("Item", {})
    return bool(profile.get("canAuthor", False))


def require_author(auth: dict) -> Staff:
    staff = require_staff(auth)
    if not can_author(staff):
        raise Forbidden("You do not have permission to edit curriculum")
    return staff
