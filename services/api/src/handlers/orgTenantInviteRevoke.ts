import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { revokeTenantInvite } from "../lib/authInvites";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    const inviteId = event.pathParameters?.inviteId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }
    if (!inviteId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing inviteId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, { tenantIdHint: tenantId });
    authorizeOrgAction(auth, "ORG_TENANT_INVITE_CREATE", tenantId);

    await revokeTenantInvite(tenantId, inviteId);
    return jsonResponse(200, { data: { revoked: true, inviteId } }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
