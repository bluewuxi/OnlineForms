import { ApiError, type ApiErrorCode } from "./errors";

const TENANT_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const RESERVED_TENANT_CODES = [
  "admin",
  "api",
  "courses",
  "health",
  "internal",
  "org",
  "public",
  "t",
  "v1"
] as const;

const RESERVED_SET = new Set<string>(RESERVED_TENANT_CODES);

type NormalizeTenantCodeOptions = {
  field?: string;
  statusCode?: number;
  code?: ApiErrorCode;
  messagePrefix?: string;
};

export function isReservedTenantCode(tenantCode: string): boolean {
  return RESERVED_SET.has(tenantCode.trim().toLowerCase());
}

export function normalizeTenantCode(
  rawTenantCode: unknown,
  options: NormalizeTenantCodeOptions = {}
): string {
  const field = options.field ?? "tenantCode";
  const statusCode = options.statusCode ?? 400;
  const code = options.code ?? "VALIDATION_ERROR";
  const messagePrefix = options.messagePrefix ?? "Invalid tenant code.";

  if (typeof rawTenantCode !== "string") {
    throw new ApiError(statusCode, code, messagePrefix, [{ field, issue: "Must be a string." }]);
  }

  const tenantCode = rawTenantCode.trim().toLowerCase();
  if (!tenantCode) {
    throw new ApiError(statusCode, code, messagePrefix, [{ field, issue: "Cannot be empty." }]);
  }
  if (!TENANT_CODE_PATTERN.test(tenantCode)) {
    throw new ApiError(statusCode, code, messagePrefix, [
      {
        field,
        issue:
          "Must be 1-40 chars of lowercase letters, numbers, or hyphens, and cannot start/end with hyphen."
      }
    ]);
  }
  if (isReservedTenantCode(tenantCode)) {
    throw new ApiError(statusCode, code, messagePrefix, [
      {
        field,
        issue: `Reserved value '${tenantCode}' is blocked for route safety.`
      }
    ]);
  }

  return tenantCode;
}
