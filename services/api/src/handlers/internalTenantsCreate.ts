import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { createTenantProfile, type CreateTenantProfileInput } from "../lib/tenants";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    authorizeOrgAction(auth, "INTERNAL_TENANT_WRITE");

    const body = parseJsonBody<CreateTenantProfileInput>(event);
    const data = await createTenantProfile(body);
    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
