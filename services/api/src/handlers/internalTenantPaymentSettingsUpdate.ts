import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { getTenantProfile, updateTenantProfile } from "../lib/tenants";

type UpdateInternalPaymentSettingsBody = {
  stripeAccountId?: string | null;
  applicationFeePercent?: number | null;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    authorizeOrgAction(auth, "INTERNAL_TENANT_WRITE");

    const body = parseJsonBody<UpdateInternalPaymentSettingsBody>(event);

    const hasStripeAccountId = Object.prototype.hasOwnProperty.call(body, "stripeAccountId");
    const hasApplicationFeePercent = Object.prototype.hasOwnProperty.call(body, "applicationFeePercent");

    if (!hasStripeAccountId && !hasApplicationFeePercent) {
      throw new ApiError(400, "VALIDATION_ERROR", "At least one field (stripeAccountId, applicationFeePercent) must be provided.");
    }

    await updateTenantProfile(tenantId, {
      ...(hasStripeAccountId ? { stripeAccountId: body.stripeAccountId ?? null } : {}),
      ...(hasApplicationFeePercent ? { applicationFeePercent: body.applicationFeePercent ?? null } : {})
    });

    const profile = await getTenantProfile(tenantId);

    await writeAuditEvent({
      tenantId,
      actorUserId: auth.userId,
      action: "payment_settings.internal_update",
      resourceType: "payment_settings",
      resourceId: tenantId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: {
        ...(hasStripeAccountId ? { stripeAccountId: profile.stripeAccountId } : {}),
        ...(hasApplicationFeePercent ? { applicationFeePercent: profile.applicationFeePercent } : {})
      }
    });

    return jsonResponse(
      200,
      {
        data: {
          currency: profile.currency,
          stripeAccountId: profile.stripeAccountId,
          applicationFeePercent: profile.applicationFeePercent
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
