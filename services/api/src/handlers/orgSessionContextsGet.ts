import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, hasTokenRoleCapability } from "../lib/auth";
import { emitSessionContextsEmptyMetric, logAuthAudit } from "../lib/authObservability";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { buildSuggestedContext, listAvailablePortals } from "../lib/sessionBootstrap";
import {
  filterUserTenantContextsByStatus,
  listUserTenantContexts,
  parseContextStatusFilter
} from "../lib/authContexts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true,
      allowMissingRole: true
    });
    const statuses = parseContextStatusFilter(event.queryStringParameters?.status);
    const contexts = filterUserTenantContextsByStatus(
      await listUserTenantContexts(auth.userId),
      statuses
    );
    const activeCount = contexts.filter((row) => row.status === "active").length;
    if (activeCount === 0) {
      emitSessionContextsEmptyMetric();
    }
    const canAccessInternalPortal =
      auth.role === "internal_admin" || hasTokenRoleCapability(auth.claims, "internal_admin");
    const availablePortals = listAvailablePortals(contexts, canAccessInternalPortal);
    const suggestedContext = buildSuggestedContext(contexts, canAccessInternalPortal);
    logAuthAudit("auth_session_contexts_listed", {
      userId: auth.userId,
      tokenRole: auth.role,
      contextsTotal: contexts.length,
      activeContexts: activeCount,
      canAccessInternalPortal,
      availablePortals,
      selectionRequired: suggestedContext === null,
      statusFilter: statuses
    });

    return jsonResponse(
      200,
      {
        data: {
          userId: auth.userId,
          tokenRole: auth.role,
          canAccessInternalPortal,
          availablePortals,
          selectionRequired: suggestedContext === null,
          suggestedContext,
          contexts
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
