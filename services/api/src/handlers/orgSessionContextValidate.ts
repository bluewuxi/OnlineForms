import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, type AuthRole } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { assertTenantRoleAllowed, listUserTenantContexts } from "../lib/authContexts";

type ContextPayload = {
  tenantId?: unknown;
  role?: unknown;
};

const allowedRoles = new Set<AuthRole>(["org_admin", "org_editor", "internal_admin", "platform_admin"]);

function parsePayload(body: string | undefined): { tenantId: string; role: AuthRole } {
  if (!body) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body is required.");
  }
  let parsed: ContextPayload;
  try {
    parsed = JSON.parse(body) as ContextPayload;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const tenantId = typeof parsed.tenantId === "string" ? parsed.tenantId.trim() : "";
  const roleRaw = typeof parsed.role === "string" ? parsed.role.trim() : "";
  if (!tenantId) {
    throw new ApiError(400, "VALIDATION_ERROR", "tenantId is required.");
  }
  if (!allowedRoles.has(roleRaw as AuthRole)) {
    throw new ApiError(400, "VALIDATION_ERROR", "role is invalid.");
  }

  return { tenantId, role: roleRaw as AuthRole };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);

  try {
    const { tenantId, role } = parsePayload(event.body);
    const auth = await authenticateRequest(
      {
        ...(event.headers ?? {}),
        "x-tenant-id": tenantId,
        "x-role": role
      },
      {
        requireMembership: false,
        allowMissingTenantContext: true,
        tenantIdHint: tenantId
      }
    );

    const contexts = await listUserTenantContexts(auth.userId);
    assertTenantRoleAllowed(contexts, tenantId, role);

    return jsonResponse(
      200,
      {
        data: {
          userId: auth.userId,
          tenantId,
          role
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
