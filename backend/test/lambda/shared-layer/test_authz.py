import pytest

from cic.authz import (
    api_key_from_auth,
    require_admin,
    require_class_access,
    require_staff,
    staff_from_auth,
    student_from_auth,
)
from cic.errors import Forbidden, NotFound, Unauthenticated


def jwt(sub="u1", groups="[instructor]"):
    claims = {"sub": sub}
    if groups is not None:
        claims["cognito:groups"] = groups
    return {"jwt": {"claims": claims}}


class FakeTable:
    """Minimal stand-in for a boto3 Table, keyed by (pk, sk)."""

    def __init__(self, *items):
        self.items = {(i["pk"], i["sk"]): i for i in items}

    def get_item(self, Key):
        item = self.items.get((Key["pk"], Key["sk"]))
        return {"Item": item} if item else {}


def test_groups_are_parsed_from_api_gateway_string_format():
    assert staff_from_auth(jwt(groups="[cic_admin instructor]")).groups == {"cic_admin", "instructor"}
    assert staff_from_auth(jwt(groups="instructor")).groups == {"instructor"}
    assert staff_from_auth(jwt(groups=None)).groups == frozenset()


def test_missing_identity_is_unauthenticated():
    with pytest.raises(Unauthenticated):
        staff_from_auth({})
    with pytest.raises(Unauthenticated):
        student_from_auth({"lambda": {"studentId": "s1"}})


def test_user_without_a_role_is_forbidden():
    with pytest.raises(Forbidden):
        require_staff(jwt(groups=None))


def test_only_admins_pass_require_admin():
    require_admin(jwt(groups="[cic_admin]"))
    with pytest.raises(Forbidden):
        require_admin(jwt(groups="[instructor]"))


def test_instructor_needs_class_membership():
    table = FakeTable({"pk": "CLS#c1", "sk": "INS#u1"})
    assert require_class_access(jwt("u1"), table, "c1").user_id == "u1"
    with pytest.raises(Forbidden):
        require_class_access(jwt("u2"), table, "c1")  # not a member
    with pytest.raises(Forbidden):
        require_class_access(jwt("u1"), table, "c2")  # different class


def test_reviewer_never_gets_class_access_even_if_listed():
    table = FakeTable({"pk": "CLS#c1", "sk": "INS#u1"}, {"pk": "CLS#c1", "sk": "META"})
    with pytest.raises(Forbidden):
        require_class_access(jwt("u1", "[reviewer]"), table, "c1")


def test_admin_can_access_existing_class_only():
    table = FakeTable({"pk": "CLS#c1", "sk": "META"})
    require_class_access(jwt("a", "[cic_admin]"), table, "c1")
    with pytest.raises(NotFound):
        require_class_access(jwt("a", "[cic_admin]"), table, "missing")


def test_student_principal_comes_from_authorizer_context():
    s = student_from_auth({"lambda": {"studentId": "s1", "classId": "c1"}})
    assert (s.student_id, s.class_id) == ("s1", "c1")


def test_api_key_scope_is_enforced():
    ctx = {"lambda": {"keyId": "k1", "scopes": "read:cohorts"}}
    assert api_key_from_auth(ctx, "read:cohorts").key_id == "k1"
    with pytest.raises(Forbidden):
        api_key_from_auth(ctx, "write:anything")
    with pytest.raises(Unauthenticated):
        api_key_from_auth({}, "read:cohorts")
