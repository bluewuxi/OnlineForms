const TENANT_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED_TENANT_CODES = new Set([
  "admin",
  "api",
  "courses",
  "health",
  "internal",
  "org",
  "public",
  "t",
  "v1"
]);

function normalizeTenantCodeOrThrow(rawTenantCode, label = "tenantCode") {
  if (typeof rawTenantCode !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const tenantCode = rawTenantCode.trim().toLowerCase();
  if (!tenantCode) {
    throw new Error(`${label} cannot be empty.`);
  }
  if (!TENANT_CODE_PATTERN.test(tenantCode)) {
    throw new Error(
      `${label} must be 1-40 chars of lowercase letters, numbers, or hyphens and cannot start/end with hyphen.`
    );
  }
  if (RESERVED_TENANT_CODES.has(tenantCode)) {
    throw new Error(`${label} '${tenantCode}' is reserved and cannot be used.`);
  }
  return tenantCode;
}

module.exports = {
  normalizeTenantCodeOrThrow
};
