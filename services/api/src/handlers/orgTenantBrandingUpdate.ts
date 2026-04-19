import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { resolveAssetPublicUrl } from "../lib/assets";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { emitBrandingUpdateMetric, logFrontendAudit } from "../lib/frontendObservability";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import {
  getTenantProfile,
  normalizeThemePatch,
  type TenantTheme,
  updateTenantBranding,
  updateTenantProfile,
  updateTenantTheme,
} from "../lib/tenants";

type UpdateTenantBrandingBody = {
  logoAssetId?: string | null;
  description?: string | null;
  homePageContent?: string | null;
  theme?: Partial<TenantTheme>;
};

async function toBrandingSettings(profile: Awaited<ReturnType<typeof getTenantProfile>>) {
  const logoAssetId = profile.branding.logoAssetId;
  return {
    tenantId: profile.tenantId,
    displayName: profile.displayName,
    description: profile.description,
    homePageContent: profile.homePageContent,
    logoAssetId,
    logoUrl: await resolveAssetPublicUrl(profile.tenantId, logoAssetId),
    theme: profile.branding.theme,
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

    let themePatch: Partial<TenantTheme> = {};
    if (body.theme !== undefined) {
      if (typeof body.theme !== "object" || body.theme === null) {
        throw new ApiError(400, "VALIDATION_ERROR", "theme must be an object.", [
          { field: "theme", issue: "invalid_type" }
        ]);
      }
      const { patch, details } = normalizeThemePatch(body.theme);
      if (details.length > 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid theme fields.", details);
      }
      themePatch = patch;
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
    if (Object.keys(themePatch).length > 0) {
      await updateTenantTheme(auth.tenantId, themePatch);
    }
    const data = await toBrandingSettings(await getTenantProfile(auth.tenantId));
    emitBrandingUpdateMetric();
    logFrontendAudit("frontend_branding_updated", {
      tenantId: auth.tenantId,
      userId: auth.userId,
      logoAssetId: data.logoAssetId
    });
    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "branding.update",
      resourceType: "branding",
      resourceId: auth.tenantId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { logoAssetId: data.logoAssetId, themePatch }
    });
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
