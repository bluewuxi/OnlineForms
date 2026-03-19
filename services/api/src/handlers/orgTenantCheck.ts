import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { assertTenantAccess, authenticateRequest, requireAnyRole } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { ApiError } from "../lib/errors";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);

  try {
    const resourceTenantId = event.pathParameters?.tenantId?.trim();
    if (!resourceTenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }
    const auth = await authenticateRequest(event.headers, { tenantIdHint: resourceTenantId });
    requireAnyRole(auth, ["org_admin", "org_editor", "platform_admin"]);

    assertTenantAccess(auth, resourceTenantId);

    return jsonResponse(
      200,
      {
        data: {
          authorized: true,
          tenantId: resourceTenantId,
          requestedBy: auth.userId,
          role: auth.role
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
