import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  type GroupType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { listUserTenantContexts, type UserTenantContext } from "./authContexts";
import { ApiError } from "./errors";

export type InternalRole = "internal_admin" | "platform_admin";

export type InternalAccessUser = {
  userId: string;
  username: string;
  email: string | null;
  preferredName: string | null;
  enabled: boolean;
  status: string;
  internalRoles: InternalRole[];
};

export type InternalAccessUserPage = {
  data: InternalAccessUser[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
};

export type InternalAccessUserDetail = InternalAccessUser & {
  memberships: UserTenantContext[];
};

export type CreateInternalUserInput = {
  email: string;
  preferredName?: string | null;
  password: string;
  temporaryPassword?: boolean;
  internalRoles: InternalRole[];
  enabled?: boolean;
};

type UserLoader = {
  list: (limit: number, cursor?: string) => Promise<InternalAccessUserPage>;
  get: (userId: string) => Promise<InternalAccessUserDetail>;
  create: (input: CreateInternalUserInput) => Promise<InternalAccessUser>;
  activate: (userId: string, actorUserId: string) => Promise<InternalAccessUser>;
  deactivate: (userId: string, actorUserId: string) => Promise<InternalAccessUser>;
  addRole: (userId: string, role: InternalRole, actorUserId: string) => Promise<InternalAccessUser>;
  removeRole: (userId: string, role: InternalRole, actorUserId: string) => Promise<InternalAccessUser>;
  resetPassword: (
    userId: string,
    password: string,
    actorUserId: string,
  ) => Promise<{ userId: string; passwordReset: true; temporaryPassword: true }>;
};

type CognitoUserRecord = {
  username: string;
  base: InternalAccessUser;
};

const cognito = new CognitoIdentityProviderClient({});
const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
const internalGroupName = process.env.COGNITO_INTERNAL_GROUP_NAME?.trim() || "internal_admin";
const roleToGroupName: Record<InternalRole, string> = {
  internal_admin: internalGroupName,
  platform_admin: "platform_admin",
};
const supportedInternalRoles = Object.keys(roleToGroupName) as InternalRole[];

function readAttribute(
  attributes: Array<{ Name?: string; Value?: string }> | undefined,
  name: string,
): string | null {
  const hit = attributes?.find((row) => row.Name === name);
  const value = hit?.Value?.trim();
  return value && value.length > 0 ? value : null;
}

function normalizeEmail(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value || !value.includes("@")) {
    throw new ApiError(400, "VALIDATION_ERROR", "email must be a valid email address.");
  }
  return value;
}

function normalizePreferredName(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validatePassword(password: string): string {
  const value = password.trim();
  if (value.length < 10) {
    throw new ApiError(400, "VALIDATION_ERROR", "password must be at least 10 characters long.", [
      { field: "password", issue: "too_short" },
    ]);
  }
  return value;
}

function normalizeRoles(input: InternalRole[]): InternalRole[] {
  const roles = Array.from(new Set(input)).filter((role): role is InternalRole =>
    supportedInternalRoles.includes(role),
  );
  if (roles.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one internal role is required.", [
      { field: "internalRoles", issue: "required" },
    ]);
  }
  return roles;
}

function mapGroupNameToRole(groupName: string | undefined): InternalRole | null {
  if (!groupName) return null;
  const found = supportedInternalRoles.find((role) => roleToGroupName[role] === groupName);
  return found ?? null;
}

function mapGroupsToRoles(groups: Array<{ GroupName?: string }> | undefined): InternalRole[] {
  return Array.from(
    new Set(
      (groups ?? [])
        .map((row) => mapGroupNameToRole(row.GroupName))
        .filter((value): value is InternalRole => Boolean(value)),
    ),
  );
}

function mapUser(row: UserType, internalRoles: InternalRole[] = []): InternalAccessUser {
  const sub = readAttribute(row.Attributes, "sub");
  const email = readAttribute(row.Attributes, "email");
  const preferredName =
    readAttribute(row.Attributes, "preferred_username") ?? readAttribute(row.Attributes, "name");
  return {
    userId: sub ?? row.Username ?? "unknown",
    username: row.Username ?? email ?? "unknown",
    email,
    preferredName,
    enabled: row.Enabled ?? false,
    status: row.UserStatus ?? "UNKNOWN",
    internalRoles,
  } satisfies InternalAccessUser;
}

function mapAdminGetUserResponse(payload: {
  Username?: string;
  UserAttributes?: Array<{ Name?: string; Value?: string }>;
  Enabled?: boolean;
  UserStatus?: string;
}, internalRoles: InternalRole[] = []): InternalAccessUser {
  const sub = readAttribute(payload.UserAttributes, "sub");
  const email = readAttribute(payload.UserAttributes, "email");
  const preferredName =
    readAttribute(payload.UserAttributes, "preferred_username") ??
    readAttribute(payload.UserAttributes, "name");
  return {
    userId: sub ?? payload.Username ?? "unknown",
    username: payload.Username ?? email ?? "unknown",
    email,
    preferredName,
    enabled: payload.Enabled ?? false,
    status: payload.UserStatus ?? "UNKNOWN",
    internalRoles,
  };
}

function isCognitoError(error: unknown, name: string): boolean {
  if (!error || typeof error !== "object") return false;
  return "name" in error && String(error.name) === name;
}

function isUserNotFound(error: unknown): boolean {
  return isCognitoError(error, "UserNotFoundException");
}

function isGroupNotFound(error: unknown): boolean {
  return isCognitoError(error, "ResourceNotFoundException") || isCognitoError(error, "GroupNotFoundException");
}

function ensureUserPool(): string {
  if (!userPoolId) {
    throw new ApiError(500, "INTERNAL_ERROR", "COGNITO_USER_POOL_ID is required for internal user operations.");
  }
  return userPoolId;
}

async function listUsersForRole(role: InternalRole, limit: number): Promise<InternalAccessUser[]> {
  const poolId = ensureUserPool();
  try {
    const out = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId: poolId,
        GroupName: roleToGroupName[role],
        Limit: limit,
      }),
    );
    return (out.Users ?? []).map((row) => mapUser(row, [role]));
  } catch (error) {
    if (isGroupNotFound(error)) {
      return [];
    }
    throw error;
  }
}

async function findUsers(filter: string): Promise<UserType[]> {
  const poolId = ensureUserPool();
  const out = await cognito.send(
    new ListUsersCommand({
      UserPoolId: poolId,
      Filter: filter,
      Limit: 2,
    }),
  );
  return out.Users ?? [];
}

async function loadUserByIdentifier(userId: string): Promise<CognitoUserRecord> {
  const poolId = ensureUserPool();
  try {
    const out = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: poolId,
        Username: userId,
      }),
    );
    const groupsOut = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: poolId,
        Username: out.Username ?? userId,
      }),
    );
    const internalRoles = mapGroupsToRoles(groupsOut.Groups);
    return {
      username: out.Username ?? userId,
      base: mapAdminGetUserResponse(out, internalRoles),
    };
  } catch (error) {
    if (!isUserNotFound(error)) {
      throw error;
    }
  }

  const identifier = userId.trim();
  const fallbackUsers = identifier.includes("@")
    ? await findUsers(`email = "${normalizeEmail(identifier)}"`)
    : await findUsers(`sub = "${identifier}"`);
  if (fallbackUsers.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "Internal user not found.");
  }
  const selected = fallbackUsers[0];
  const username = selected.Username;
  if (!username) {
    throw new ApiError(409, "CONFLICT", "User record is missing Cognito username.");
  }
  const groupsOut = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: poolId,
      Username: username,
    }),
  );
  return {
    username,
    base: mapUser(selected, mapGroupsToRoles(groupsOut.Groups)),
  };
}

async function countPrivilegedUsers(): Promise<number> {
  const users = await listInternalAccessUsersFromCognito(200);
  return users.data.filter(
    (user) =>
      user.enabled &&
      user.internalRoles.some((role) => supportedInternalRoles.includes(role)),
  ).length;
}

async function assertMutationSafety(
  target: InternalAccessUser,
  actorUserId: string,
  operation: "deactivate" | "remove_role",
  role?: InternalRole,
): Promise<void> {
  const isSelf = target.userId === actorUserId;
  if (operation === "deactivate" && isSelf) {
    throw new ApiError(409, "CONFLICT", "You cannot deactivate your own internal account.");
  }
  if (operation === "remove_role" && isSelf && role && target.internalRoles.includes(role)) {
    throw new ApiError(409, "CONFLICT", "You cannot remove your own critical internal role.");
  }

  const affectedPrivileged =
    operation === "deactivate"
      ? target.internalRoles.length > 0
      : Boolean(role && target.internalRoles.includes(role));
  if (!affectedPrivileged) {
    return;
  }

  const privilegedCount = await countPrivilegedUsers();
  if (privilegedCount <= 1) {
    throw new ApiError(
      409,
      "CONFLICT",
      "This action is blocked because it would leave the platform without an active internal administrator.",
    );
  }
}

async function listInternalAccessUsersFromCognito(limit: number, _cursor?: string): Promise<InternalAccessUserPage> {
  ensureUserPool();
  const merged = new Map<string, InternalAccessUser>();
  for (const role of supportedInternalRoles) {
    const rows = await listUsersForRole(role, limit);
    for (const row of rows) {
      const existing = merged.get(row.username);
      if (!existing) {
        merged.set(row.username, row);
        continue;
      }
      existing.internalRoles = Array.from(new Set([...existing.internalRoles, ...row.internalRoles]));
      existing.preferredName = existing.preferredName ?? row.preferredName;
      existing.email = existing.email ?? row.email;
      existing.enabled = existing.enabled || row.enabled;
      if (existing.userId === "unknown" && row.userId !== "unknown") {
        existing.userId = row.userId;
      }
    }
  }

  const users = Array.from(merged.values())
    .sort((left, right) =>
      (left.preferredName ?? left.email ?? left.username).localeCompare(
        right.preferredName ?? right.email ?? right.username,
      ),
    )
    .slice(0, limit);

  return {
    data: users,
    page: {
      limit,
      nextCursor: null,
    },
  };
}

async function getInternalAccessUserFromCognito(userId: string): Promise<InternalAccessUserDetail> {
  const record = await loadUserByIdentifier(userId);
  return {
    ...record.base,
    memberships: await listUserTenantContexts(record.base.userId),
  };
}

async function createInternalUserInCognito(input: CreateInternalUserInput): Promise<InternalAccessUser> {
  const poolId = ensureUserPool();
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);
  const preferredName = normalizePreferredName(input.preferredName);
  const internalRoles = normalizeRoles(input.internalRoles);
  const existingUsers = await findUsers(`email = "${email}"`);
  if (existingUsers.length > 0) {
    throw new ApiError(409, "CONFLICT", "A user with this email already exists.");
  }

  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: email,
      MessageAction: "SUPPRESS",
      TemporaryPassword: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        ...(preferredName ? [{ Name: "preferred_username", Value: preferredName }] : []),
      ],
    }),
  );

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: email,
      Password: password,
      Permanent: input.temporaryPassword !== true,
    }),
  );

  for (const role of internalRoles) {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: poolId,
        Username: email,
        GroupName: roleToGroupName[role],
      }),
    );
  }

  if (input.enabled === false) {
    await cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: poolId,
        Username: email,
      }),
    );
  }

  const created = await loadUserByIdentifier(email);
  return created.base;
}

async function activateInternalUserInCognito(userId: string): Promise<InternalAccessUser> {
  const poolId = ensureUserPool();
  const record = await loadUserByIdentifier(userId);
  await cognito.send(
    new AdminEnableUserCommand({
      UserPoolId: poolId,
      Username: record.username,
    }),
  );
  return (await loadUserByIdentifier(record.username)).base;
}

async function deactivateInternalUserInCognito(userId: string, actorUserId: string): Promise<InternalAccessUser> {
  const poolId = ensureUserPool();
  const record = await loadUserByIdentifier(userId);
  await assertMutationSafety(record.base, actorUserId, "deactivate");
  await cognito.send(
    new AdminDisableUserCommand({
      UserPoolId: poolId,
      Username: record.username,
    }),
  );
  return (await loadUserByIdentifier(record.username)).base;
}

async function addInternalRoleInCognito(
  userId: string,
  role: InternalRole,
): Promise<InternalAccessUser> {
  const poolId = ensureUserPool();
  const record = await loadUserByIdentifier(userId);
  if (record.base.internalRoles.includes(role)) {
    throw new ApiError(409, "CONFLICT", "User already has this internal role.");
  }
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: poolId,
      Username: record.username,
      GroupName: roleToGroupName[role],
    }),
  );
  return (await loadUserByIdentifier(record.username)).base;
}

async function removeInternalRoleInCognito(
  userId: string,
  role: InternalRole,
  actorUserId: string,
): Promise<InternalAccessUser> {
  const poolId = ensureUserPool();
  const record = await loadUserByIdentifier(userId);
  if (!record.base.internalRoles.includes(role)) {
    throw new ApiError(409, "CONFLICT", "User does not currently have this internal role.");
  }
  await assertMutationSafety(record.base, actorUserId, "remove_role", role);
  await cognito.send(
    new AdminRemoveUserFromGroupCommand({
      UserPoolId: poolId,
      Username: record.username,
      GroupName: roleToGroupName[role],
    }),
  );
  return (await loadUserByIdentifier(record.username)).base;
}

async function resetInternalUserPasswordInCognito(
  userId: string,
  password: string,
): Promise<{ userId: string; passwordReset: true; temporaryPassword: true }> {
  const poolId = ensureUserPool();
  const record = await loadUserByIdentifier(userId);
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: record.username,
      Password: validatePassword(password),
      Permanent: false,
    }),
  );
  return {
    userId: record.base.userId,
    passwordReset: true,
    temporaryPassword: true,
  };
}

const liveLoader: UserLoader = {
  list: listInternalAccessUsersFromCognito,
  get: getInternalAccessUserFromCognito,
  create: createInternalUserInCognito,
  activate: activateInternalUserInCognito,
  deactivate: deactivateInternalUserInCognito,
  addRole: addInternalRoleInCognito,
  removeRole: removeInternalRoleInCognito,
  resetPassword: resetInternalUserPasswordInCognito,
};

let testLoaderOverride: Partial<UserLoader> | null = null;

export const __internalAccessUsersTestHooks = {
  setLoaderOverride(loader: ((limit: number, cursor?: string) => Promise<InternalAccessUserPage>) | null): void {
    if (!loader) {
      testLoaderOverride = null;
      return;
    }
    testLoaderOverride = {
      ...(testLoaderOverride ?? {}),
      list: loader,
    };
  },
  setUserOpsOverride(override: Partial<UserLoader> | null): void {
    testLoaderOverride = override;
  },
  reset(): void {
    testLoaderOverride = null;
  },
};

export async function listInternalAccessUsers(limit: number, cursor?: string): Promise<InternalAccessUserPage> {
  const loader = testLoaderOverride?.list ?? liveLoader.list;
  return loader(limit, cursor);
}

export async function getInternalAccessUser(userId: string): Promise<InternalAccessUserDetail> {
  const loader = testLoaderOverride?.get ?? liveLoader.get;
  return loader(userId);
}

export async function createInternalUser(input: CreateInternalUserInput): Promise<InternalAccessUser> {
  const loader = testLoaderOverride?.create ?? liveLoader.create;
  return loader(input);
}

export async function activateInternalUser(userId: string, actorUserId: string): Promise<InternalAccessUser> {
  const loader = testLoaderOverride?.activate ?? liveLoader.activate;
  return loader(userId, actorUserId);
}

export async function deactivateInternalUser(userId: string, actorUserId: string): Promise<InternalAccessUser> {
  const loader = testLoaderOverride?.deactivate ?? liveLoader.deactivate;
  return loader(userId, actorUserId);
}

export async function addInternalUserRole(
  userId: string,
  role: InternalRole,
  actorUserId: string,
): Promise<InternalAccessUser> {
  const loader = testLoaderOverride?.addRole ?? liveLoader.addRole;
  return loader(userId, role, actorUserId);
}

export async function removeInternalUserRole(
  userId: string,
  role: InternalRole,
  actorUserId: string,
): Promise<InternalAccessUser> {
  const loader = testLoaderOverride?.removeRole ?? liveLoader.removeRole;
  return loader(userId, role, actorUserId);
}

export async function resetInternalUserPassword(
  userId: string,
  password: string,
  actorUserId: string,
): Promise<{ userId: string; passwordReset: true; temporaryPassword: true }> {
  const loader = testLoaderOverride?.resetPassword ?? liveLoader.resetPassword;
  return loader(userId, password, actorUserId);
}
