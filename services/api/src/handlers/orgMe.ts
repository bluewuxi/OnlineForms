import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { buildSessionBootstrapResponseData, toNullableTenantId } from "../lib/sessionBootstrap";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);

  try {
    const auth = await authenticateRequest(event.headers, {
      allowMissingTenantContext: true,
      requireMembership: false
    });
    authorizeOrgAction(auth, "ORG_ME_READ");

    return jsonResponse(
      200,
      {
        data: buildSessionBootstrapResponseData(auth.userId, auth.role, toNullableTenantId(auth.tenantId))
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};


