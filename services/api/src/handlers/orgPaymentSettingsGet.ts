import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { getTenantProfile } from "../lib/tenants";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_TENANT_SETTINGS_READ");
    const profile = await getTenantProfile(auth.tenantId);
    return jsonResponse(
      200,
      {
        data: {
          currency: profile.currency,
          invoiceBusinessName: profile.invoiceBusinessName
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
