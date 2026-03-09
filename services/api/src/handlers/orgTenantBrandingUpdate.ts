import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, requireAnyRole } from "../lib/auth";
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
    requireAnyRole(auth, ["org_admin", "org_editor", "platform_admin"]);

    const body = parseJsonBody<UpdateTenantBrandingBody>(event);
    const data = await updateTenantBranding(auth.tenantId, body.logoAssetId ?? null);
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
