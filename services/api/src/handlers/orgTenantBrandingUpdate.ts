import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { emitBrandingUpdateMetric, logFrontendAudit } from "../lib/frontendObservability";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { getTenantProfile, updateTenantBranding, updateTenantProfile } from "../lib/tenants";

type UpdateTenantBrandingBody = {
  logoAssetId?: string | null;
  description?: string | null;
  homePageContent?: string | null;
};

function toBrandingSettings(profile: Awaited<ReturnType<typeof getTenantProfile>>) {
  const logoAssetId = profile.branding.logoAssetId;
  return {
    tenantId: profile.tenantId,
    displayName: profile.displayName,
    description: profile.description,
    homePageContent: profile.homePageContent,
    logoAssetId,
    logoUrl: logoAssetId ? `https://cdn.onlineforms.com/assets/${logoAssetId}` : null,
    updatedAt: profile.updatedAt
  };
}

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
    if (body.description !== null && body.description !== undefined && typeof body.description !== "string") {
      throw new ApiError(400, "VALIDATION_ERROR", "description must be a string or null.", [
        { field: "description", issue: "invalid_type" }
      ]);
    }
    if (
      body.homePageContent !== null &&
      body.homePageContent !== undefined &&
      typeof body.homePageContent !== "string"
    ) {
      throw new ApiError(400, "VALIDATION_ERROR", "homePageContent must be a string or null.", [
        { field: "homePageContent", issue: "invalid_type" }
      ]);
    }

    if (Object.prototype.hasOwnProperty.call(body, "logoAssetId")) {
      await updateTenantBranding(auth.tenantId, body.logoAssetId ?? null);
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "description") ||
      Object.prototype.hasOwnProperty.call(body, "homePageContent")
    ) {
      await updateTenantProfile(auth.tenantId, {
        ...(Object.prototype.hasOwnProperty.call(body, "description")
          ? { description: body.description ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "homePageContent")
          ? { homePageContent: body.homePageContent ?? null }
          : {})
      });
    }
    const data = toBrandingSettings(await getTenantProfile(auth.tenantId));
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

