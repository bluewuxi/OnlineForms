import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, type AuthRole } from "../lib/auth";
import {
  emitSessionContextValidationDeniedMetric,
  emitSessionContextValidationInvalidMetric,
  emitSessionContextValidationSuccessMetric,
  logAuthAudit
} from "../lib/authObservability";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { buildSessionBootstrapResponseData } from "../lib/sessionBootstrap";
import { assertTenantRoleAllowed, listUserTenantContexts } from "../lib/authContexts";
import { writeInternalUserActivity } from "../lib/internalUserActivity";

type ContextPayload = {
  tenantId?: unknown;
  role?: unknown;
};

const allowedRoles = new Set<AuthRole>(["org_viewer", "org_editor", "org_admin", "internal_admin", "platform_support"]);

function parsePayload(body: string | undefined): { tenantId?: string; role: AuthRole } {
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
  if (!allowedRoles.has(roleRaw as AuthRole)) {
    throw new ApiError(400, "VALIDATION_ERROR", "role is invalid.", [{ field: "role", issue: "invalid_role" }]);
  }
  if (!tenantId && roleRaw !== "internal_admin") {
    throw new ApiError(400, "VALIDATION_ERROR", "tenantId is required.", [
      { field: "tenantId", issue: "tenant_required" }
    ]);
  }

  return { tenantId: tenantId || undefined, role: roleRaw as AuthRole };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);

  try {
    const { tenantId, role } = parsePayload(event.body);
    const authHeaders: Record<string, string | undefined> = {
      ...(event.headers ?? {}),
      "x-role": role
    };
    if (tenantId) {
      authHeaders["x-tenant-id"] = tenantId;
    }
    const auth = await authenticateRequest(
      authHeaders,
      {
        requireMembership: false,
        allowMissingTenantContext: true,
        tenantIdHint: tenantId
      }
    );

    if (role !== "internal_admin" && tenantId) {
      const contexts = await listUserTenantContexts(auth.userId);
      assertTenantRoleAllowed(contexts, tenantId, role);
    } else if (role !== "internal_admin") {
      throw new ApiError(400, "VALIDATION_ERROR", "tenantId is required.", [
        { field: "tenantId", issue: "tenant_required" }
      ]);
    }
    emitSessionContextValidationSuccessMetric();
    logAuthAudit("auth_session_context_validation_succeeded", {
      userId: auth.userId,
      tenantId,
      role
    });
    if (role === "internal_admin" || role === "platform_support") {
      await writeInternalUserActivity({
        userId: auth.userId,
        actorUserId: auth.userId,
        eventType: "internal_user.login",
        summary: "Internal user signed in to the management console.",
        details: {
          role,
        },
      });
    }

    return jsonResponse(
      200,
      {
        data: buildSessionBootstrapResponseData(auth.userId, role, tenantId ?? null)
      },
      correlation
    );
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.statusCode === 400) {
        emitSessionContextValidationInvalidMetric();
        logAuthAudit("auth_session_context_validation_invalid", {
          reason: error.message
        });
      } else if (error.statusCode === 403) {
        emitSessionContextValidationDeniedMetric();
        logAuthAudit("auth_session_context_validation_denied", {
          reason: error.message
        });
      }
    }
    return errorResponse(error, correlation);
  }
};
