import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { writeAuditEvent } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { deleteFormTemplate } from "../lib/formTemplates";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_WRITE");

    const templateId = event.pathParameters?.templateId;
    if (!templateId) throw new ApiError(400, "VALIDATION_ERROR", "Missing templateId path parameter.");

    await deleteFormTemplate(auth.tenantId, templateId);

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "form_template.delete",
      resourceType: "form_template",
      resourceId: templateId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { templateId },
    });

    return jsonResponse(200, { data: { deleted: true, templateId } }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
