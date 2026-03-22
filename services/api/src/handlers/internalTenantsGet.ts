import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { getTenantProfile } from "../lib/tenants";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    authorizeOrgAction(auth, "INTERNAL_TENANT_READ");

    const data = await getTenantProfile(tenantId);
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
