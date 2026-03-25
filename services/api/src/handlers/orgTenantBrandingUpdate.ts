import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { emitBrandingUpdateMetric, logFrontendAudit } from "../lib/frontendObservability";
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
    if (body.logoAssetId !== null && body.logoAssetId !== undefined && typeof body.logoAssetId !== "string") {
      throw new ApiError(400, "VALIDATION_ERROR", "logoAssetId must be a string or null.", [
        { field: "logoAssetId", issue: "invalid_type" }
      ]);
    }
    const data = await updateTenantBranding(auth.tenantId, body.logoAssetId ?? null);
    emitBrandingUpdateMetric();
    logFrontendAudit("frontend_branding_updated", {
      tenantId: auth.tenantId,
      userId: auth.userId,
      logoAssetId: data.logoAssetId
    });
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

