import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { getTenantProfile, updateTenantProfile } from "../lib/tenants";

type UpdatePaymentSettingsBody = {
  currency?: string | null;
  invoiceBusinessName?: string | null;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_TENANT_SETTINGS_WRITE");

    const body = parseJsonBody<UpdatePaymentSettingsBody>(event);

    const hasCurrency = Object.prototype.hasOwnProperty.call(body, "currency");
    const hasInvoiceBusinessName = Object.prototype.hasOwnProperty.call(body, "invoiceBusinessName");

    if (!hasCurrency && !hasInvoiceBusinessName) {
      throw new ApiError(400, "VALIDATION_ERROR", "At least one field (currency, invoiceBusinessName) must be provided.");
    }

    await updateTenantProfile(auth.tenantId, {
      ...(hasCurrency ? { currency: body.currency ?? null } : {}),
      ...(hasInvoiceBusinessName ? { invoiceBusinessName: body.invoiceBusinessName ?? null } : {})
    });

    const profile = await getTenantProfile(auth.tenantId);

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "payment_settings.update",
      resourceType: "payment_settings",
      resourceId: auth.tenantId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: {
        ...(hasCurrency ? { currency: profile.currency } : {}),
        ...(hasInvoiceBusinessName ? { invoiceBusinessName: profile.invoiceBusinessName } : {})
      }
    });

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
