import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { getTenantProfile } from "../lib/tenants";

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
    authorizeOrgAction(auth, "ORG_TENANT_SETTINGS_READ");
    const profile = await getTenantProfile(auth.tenantId);
    return jsonResponse(200, { data: toBrandingSettings(profile) }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
