import { CognitoJwtVerifier } from "aws-jwt-verify";
import { ApiError } from "./errors";

export type AuthRole = "org_admin" | "org_editor" | "platform_admin";

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: AuthRole;
  claims: Record<string, unknown>;
};

type HeaderMap = Record<string, string | undefined> | undefined;

const allowedRoles = new Set<AuthRole>(["org_admin", "org_editor", "platform_admin"]);

function pickHeader(headers: HeaderMap, key: string): string | undefined {
  if (!headers) return undefined;
  const hit = Object.entries(headers).find(
    ([name, value]) => name.toLowerCase() === key.toLowerCase() && typeof value === "string"
  );
  return hit?.[1];
}

function getBearerToken(headers: HeaderMap): string {
  const raw = pickHeader(headers, "authorization");
  if (!raw) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing Authorization header.");
  }
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "UNAUTHORIZED", "Authorization header must use Bearer token.");
  }
  return match[1];
}

function toRole(value: unknown): AuthRole {
  if (typeof value !== "string" || !allowedRoles.has(value as AuthRole)) {
    throw new ApiError(403, "FORBIDDEN", "JWT does not contain an allowed role.");
  }
  return value as AuthRole;
}

function toStringClaim(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(403, "FORBIDDEN", `JWT missing required claim: ${field}.`);
  }
  return value;
}

function fromMockHeaders(headers: HeaderMap): AuthContext {
  const userId = pickHeader(headers, "x-user-id") ?? "mock-user";
  const tenantId = pickHeader(headers, "x-tenant-id");
  const role = pickHeader(headers, "x-role");

  return {
    userId,
    tenantId: toStringClaim(tenantId, "x-tenant-id"),
    role: toRole(role),
    claims: {}
  };
}

let cachedVerifier: { verify: (token: string) => Promise<Record<string, unknown>> } | null = null;

function getVerifier() {
  if (cachedVerifier) return cachedVerifier;

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const tokenUse = process.env.COGNITO_TOKEN_USE === "id" ? "id" : "access";

  if (!userPoolId) {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Server auth is not configured: COGNITO_USER_POOL_ID is required."
    );
  }

  cachedVerifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse,
    clientId: clientId || null
  }) as unknown as { verify: (token: string) => Promise<Record<string, unknown>> };

  return cachedVerifier;
}

export async function authenticateRequest(headers: HeaderMap): Promise<AuthContext> {
  if (process.env.AUTH_MODE === "mock") {
    return fromMockHeaders(headers);
  }

  const token = getBearerToken(headers);
  const verifier = getVerifier();
  const payload = await verifier.verify(token);

  const userId = toStringClaim(payload.sub, "sub");
  const tenantId = toStringClaim(
    payload["custom:tenantId"] ?? payload.tenantId,
    "custom:tenantId|tenantId"
  );

  const roleClaim =
    payload["custom:role"] ??
    payload.role ??
    (Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"][0] : undefined);

  return {
    userId,
    tenantId,
    role: toRole(roleClaim),
    claims: payload as Record<string, unknown>
  };
}

export function requireAnyRole(auth: AuthContext, roles: AuthRole[]): void {
  if (!roles.includes(auth.role)) {
    throw new ApiError(403, "FORBIDDEN", "Role not allowed for this operation.");
  }
}

export function assertTenantAccess(auth: AuthContext, resourceTenantId: string): void {
  if (auth.role === "platform_admin") return;
  if (auth.tenantId !== resourceTenantId) {
    throw new ApiError(403, "FORBIDDEN", "Cross-tenant access is denied.");
  }
}
