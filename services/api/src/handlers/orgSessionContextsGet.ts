import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
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

    return jsonResponse(
      200,
      {
        data: {
          userId: auth.userId,
          tokenRole: auth.role,
          contexts
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
