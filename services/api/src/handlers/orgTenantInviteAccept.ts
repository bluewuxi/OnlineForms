import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { acceptTenantInvite } from "../lib/authInvites";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }
    const inviteId = event.pathParameters?.inviteId?.trim();
    if (!inviteId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing inviteId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, {
      tenantIdHint: tenantId,
      requireMembership: false
    });
    if (!auth.email || !auth.emailVerified) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Invite acceptance requires a verified authenticated email address."
      );
    }
    const data = await acceptTenantInvite(tenantId, inviteId, auth.userId, auth.email);
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
