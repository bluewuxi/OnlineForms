import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
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
    await writeAuditEvent({
      tenantId: data.tenantId,
      actorUserId: auth.userId,
      action: "tenant.create",
      resourceType: "tenant",
      resourceId: data.tenantId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { tenantCode: data.tenantCode, displayName: data.displayName, isActive: data.isActive }
    });
    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
