import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { updateTenantBranding } from "../lib/tenants";

type UpdateTenantBrandingBody = {
  logoAssetId: string | null;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_TENANT_SETTINGS_WRITE");

    const body = parseJsonBody<UpdateTenantBrandingBody>(event);
    const data = await updateTenantBranding(auth.tenantId, body.logoAssetId ?? null);
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

