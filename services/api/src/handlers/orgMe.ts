import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, requireAnyRole } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);

  try {
    const auth = await authenticateRequest(event.headers);
    requireAnyRole(auth, ["org_admin", "org_editor", "platform_admin"]);

    return jsonResponse(
      200,
      {
        data: {
          userId: auth.userId,
          tenantId: auth.tenantId,
          role: auth.role
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

