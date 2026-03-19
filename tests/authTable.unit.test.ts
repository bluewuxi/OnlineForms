import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_ENTITY_TYPES,
  AUTH_TABLE_NAME_DEFAULT,
  authMembershipByTenantGsiPk,
  authMembershipByTenantGsiSk,
  authTenantInviteSk,
  authTenantMemberSk,
  authTenantPk,
  authUserMembershipSk,
  authUserPk,
  authUserProfileSk
} from "../shared/src/authTable";

test("auth table defaults and entity type constants are stable", () => {
  assert.equal(AUTH_TABLE_NAME_DEFAULT, "OnlineFormsAuth");
  assert.equal(AUTH_ENTITY_TYPES.userProfile, "AUTH_USER_PROFILE");
  assert.equal(AUTH_ENTITY_TYPES.membership, "AUTH_MEMBERSHIP");
  assert.equal(AUTH_ENTITY_TYPES.invite, "AUTH_INVITE");
});

test("auth table key helpers build canonical PK/SK patterns", () => {
  assert.equal(authUserPk("usr_1"), "USER#usr_1");
  assert.equal(authUserProfileSk(), "PROFILE");
  assert.equal(authUserMembershipSk("ten_1"), "MEMBERSHIP#ten_1");
  assert.equal(authTenantPk("ten_1"), "TENANT#ten_1");
  assert.equal(authTenantMemberSk("usr_1"), "MEMBER#usr_1");
  assert.equal(authTenantInviteSk("inv_1"), "INVITE#inv_1");
});

test("auth table membership GSI helpers support tenant member list queries", () => {
  assert.equal(authMembershipByTenantGsiPk("ten_1"), "TENANT#ten_1#MEMBERS");
  assert.equal(authMembershipByTenantGsiSk("org_admin", "usr_1"), "ROLE#org_admin#USER#usr_1");
});
