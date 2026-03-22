import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, hasTokenRoleCapability } from "../lib/auth";
import { emitSessionContextsEmptyMetric, logAuthAudit } from "../lib/authObservability";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { listUserTenantContexts } from "../lib/authContexts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    const contexts = await listUserTenantContexts(auth.userId);
    const activeCount = contexts.filter((row) => row.status === "active").length;
    if (activeCount === 0) {
      emitSessionContextsEmptyMetric();
    }
    const canAccessInternalPortal = hasTokenRoleCapability(auth.claims, "internal_admin");
    logAuthAudit("auth_session_contexts_listed", {
      userId: auth.userId,
      tokenRole: auth.role,
      contextsTotal: contexts.length,
      activeContexts: activeCount,
      canAccessInternalPortal
    });

    return jsonResponse(
      200,
      {
        data: {
          userId: auth.userId,
          tokenRole: auth.role,
          canAccessInternalPortal,
          contexts
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
