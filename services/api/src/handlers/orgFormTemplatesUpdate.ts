import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { writeAuditEvent } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { updateFormTemplate, type FormField } from "../lib/formTemplates";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

type UpdateTemplateBody = {
  name?: string;
  description?: string | null;
  fields?: FormField[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_WRITE");

    const templateId = event.pathParameters?.templateId;
    if (!templateId) throw new ApiError(400, "VALIDATION_ERROR", "Missing templateId path parameter.");

    const body = parseJsonBody<UpdateTemplateBody>(event);

    const template = await updateFormTemplate(auth.tenantId, templateId, auth.userId, {
      name: body.name,
      description: body.description,
      fields: body.fields,
    });

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "form_template.update",
      resourceType: "form_template",
      resourceId: templateId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { templateId, name: template.name },
    });

    return jsonResponse(200, { data: template }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
