import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { emitInternalAccessRevokeMetric, logAuthAudit } from "../lib/authObservability";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { removeInternalAccessUser } from "../lib/internalAccessUsers";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const userId = event.pathParameters?.userId?.trim();
    if (!userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing userId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    authorizeOrgAction(auth, "INTERNAL_USER_WRITE");

    const data = await removeInternalAccessUser(userId);
    emitInternalAccessRevokeMetric();
    logAuthAudit("auth_internal_access_revoked", {
      actorUserId: auth.userId,
      targetUserId: userId
    });
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    if (error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 409)) {
      logAuthAudit("auth_internal_access_mutation_failed", {
        action: "revoke",
        reason: error.message,
        code: error.code
      });
    }
    return errorResponse(error, correlation);
  }
};
