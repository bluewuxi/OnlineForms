import {
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  ListUsersCommand,
  type UserType
} from "@aws-sdk/client-cognito-identity-provider";
import { listUserTenantContexts, type UserTenantContext } from "./authContexts";
import { ApiError } from "./errors";

export type InternalAccessUser = {
  userId: string;
  username: string;
  email: string | null;
  enabled: boolean;
  status: string;
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

type UserLoader = {
  list: (limit: number, cursor?: string) => Promise<InternalAccessUserPage>;
  get: (userId: string) => Promise<InternalAccessUserDetail>;
  addByEmail: (email: string) => Promise<InternalAccessUser>;
  remove: (userId: string) => Promise<{ userId: string; removed: true }>;
};

const cognito = new CognitoIdentityProviderClient({});
const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
const internalGroupName = process.env.COGNITO_INTERNAL_GROUP_NAME?.trim() || "internal_admin";

function readAttribute(
  attributes: Array<{ Name?: string; Value?: string }> | undefined,
  name: string
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

function mapUser(row: UserType): InternalAccessUser {
  const sub = readAttribute(row.Attributes, "sub");
  const email = readAttribute(row.Attributes, "email");
  return {
    userId: sub ?? row.Username ?? "unknown",
    username: row.Username ?? "unknown",
    email,
    enabled: row.Enabled ?? false,
    status: row.UserStatus ?? "UNKNOWN"
  } satisfies InternalAccessUser;
}

function mapAdminGetUserResponse(payload: {
  Username?: string;
  UserAttributes?: Array<{ Name?: string; Value?: string }>;
  Enabled?: boolean;
  UserStatus?: string;
}): InternalAccessUser {
  const sub = readAttribute(payload.UserAttributes, "sub");
  const email = readAttribute(payload.UserAttributes, "email");
  return {
    userId: sub ?? payload.Username ?? "unknown",
    username: payload.Username ?? "unknown",
    email,
    enabled: payload.Enabled ?? false,
    status: payload.UserStatus ?? "UNKNOWN"
  };
}

function isUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "UserNotFoundException";
}

function isGroupPresent(groups: Array<{ GroupName?: string }> | undefined): boolean {
  return (groups ?? []).some((row) => row.GroupName === internalGroupName);
}

async function listInternalAccessUsersFromCognito(limit: number, cursor?: string): Promise<InternalAccessUserPage> {
  if (!userPoolId) {
    throw new ApiError(500, "INTERNAL_ERROR", "COGNITO_USER_POOL_ID is required for internal-access user listing.");
  }
  const out = await cognito.send(
    new ListUsersInGroupCommand({
      UserPoolId: userPoolId,
      GroupName: internalGroupName,
      Limit: limit,
      NextToken: cursor
    })
  );
  const users = (out.Users ?? []).map(mapUser);

  return {
    data: users,
    page: {
      limit,
      nextCursor: out.NextToken ?? null
    }
  };
}

async function getInternalAccessUserFromCognito(userId: string): Promise<InternalAccessUserDetail> {
  if (!userPoolId) {
    throw new ApiError(500, "INTERNAL_ERROR", "COGNITO_USER_POOL_ID is required for internal user detail.");
  }
  try {
    const out = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: userId
      })
    );
    const base = mapAdminGetUserResponse(out);
    return {
      ...base,
      memberships: await listUserTenantContexts(base.userId)
    };
  } catch (error) {
    if (isUserNotFound(error)) {
      throw new ApiError(404, "NOT_FOUND", "Internal user not found.");
    }
    throw error;
  }
}

async function addInternalAccessUserByEmailInCognito(emailInput: string): Promise<InternalAccessUser> {
  if (!userPoolId) {
    throw new ApiError(500, "INTERNAL_ERROR", "COGNITO_USER_POOL_ID is required for internal user add.");
  }
  const email = normalizeEmail(emailInput);
  const usersOut = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 2
    })
  );
  const users = usersOut.Users ?? [];
  if (users.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "User with the given email was not found.");
  }

  const selected = users[0];
  const username = selected.Username;
  if (!username) {
    throw new ApiError(409, "CONFLICT", "User record is missing Cognito username.");
  }
  const groupsOut = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username
    })
  );
  if (isGroupPresent(groupsOut.Groups)) {
    throw new ApiError(409, "CONFLICT", "User already has internal access.");
  }

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: username,
      GroupName: internalGroupName
    })
  );
  return mapUser(selected);
}

async function removeInternalAccessUserInCognito(userId: string): Promise<{ userId: string; removed: true }> {
  if (!userPoolId) {
    throw new ApiError(500, "INTERNAL_ERROR", "COGNITO_USER_POOL_ID is required for internal user remove.");
  }
  try {
    await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: userId
      })
    );
  } catch (error) {
    if (isUserNotFound(error)) {
      throw new ApiError(404, "NOT_FOUND", "Internal user not found.");
    }
    throw error;
  }

  const groupsOut = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: userId
    })
  );
  if (!isGroupPresent(groupsOut.Groups)) {
    throw new ApiError(409, "CONFLICT", "User does not currently have internal access.");
  }

  await cognito.send(
    new AdminRemoveUserFromGroupCommand({
      UserPoolId: userPoolId,
      Username: userId,
      GroupName: internalGroupName
    })
  );
  return { userId, removed: true };
}

const liveLoader: UserLoader = {
  list: listInternalAccessUsersFromCognito,
  get: getInternalAccessUserFromCognito,
  addByEmail: addInternalAccessUserByEmailInCognito,
  remove: removeInternalAccessUserInCognito
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
      list: loader
    };
  },
  setUserOpsOverride(override: Partial<UserLoader> | null): void {
    testLoaderOverride = override;
  },
  reset(): void {
    testLoaderOverride = null;
  }
};

export async function listInternalAccessUsers(limit: number, cursor?: string): Promise<InternalAccessUserPage> {
  const loader = testLoaderOverride?.list ?? liveLoader.list;
  return loader(limit, cursor);
}

export async function getInternalAccessUser(userId: string): Promise<InternalAccessUserDetail> {
  const loader = testLoaderOverride?.get ?? liveLoader.get;
  return loader(userId);
}

export async function addInternalAccessUserByEmail(email: string): Promise<InternalAccessUser> {
  const loader = testLoaderOverride?.addByEmail ?? liveLoader.addByEmail;
  return loader(email);
}

export async function removeInternalAccessUser(userId: string): Promise<{ userId: string; removed: true }> {
  const loader = testLoaderOverride?.remove ?? liveLoader.remove;
  return loader(userId);
}
