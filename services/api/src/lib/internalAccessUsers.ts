import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserType
} from "@aws-sdk/client-cognito-identity-provider";
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

type UserLoader = (limit: number, cursor?: string) => Promise<InternalAccessUserPage>;

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

async function loadInternalAccessUsers(limit: number, cursor?: string): Promise<InternalAccessUserPage> {
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
  const users = (out.Users ?? []).map((row: UserType) => {
    const sub = readAttribute(row.Attributes, "sub");
    const email = readAttribute(row.Attributes, "email");
    return {
      userId: sub ?? row.Username ?? "unknown",
      username: row.Username ?? "unknown",
      email,
      enabled: row.Enabled ?? false,
      status: row.UserStatus ?? "UNKNOWN"
    } satisfies InternalAccessUser;
  });

  return {
    data: users,
    page: {
      limit,
      nextCursor: out.NextToken ?? null
    }
  };
}

let testLoaderOverride: UserLoader | null = null;

export const __internalAccessUsersTestHooks = {
  setLoaderOverride(loader: UserLoader | null): void {
    testLoaderOverride = loader;
  },
  reset(): void {
    testLoaderOverride = null;
  }
};

export async function listInternalAccessUsers(limit: number, cursor?: string): Promise<InternalAccessUserPage> {
  const loader = testLoaderOverride ?? loadInternalAccessUsers;
  return loader(limit, cursor);
}
