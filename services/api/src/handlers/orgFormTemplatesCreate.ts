import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { writeAuditEvent } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { createFormTemplate, type FormField } from "../lib/formTemplates";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

type CreateTemplateBody = {
  name: string;
  description?: string | null;
  fields: FormField[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_WRITE");

    const body = parseJsonBody<CreateTemplateBody>(event);
    if (!body.name) throw new ApiError(400, "VALIDATION_ERROR", "name is required.");
    if (!Array.isArray(body.fields)) throw new ApiError(400, "VALIDATION_ERROR", "fields must be an array.");

    const template = await createFormTemplate(auth.tenantId, auth.userId, {
      name: body.name,
      description: body.description,
      fields: body.fields,
    });

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "form_template.create",
      resourceType: "form_template",
      resourceId: template.templateId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { templateId: template.templateId, name: template.name, fieldCount: template.fields.length },
    });

    return jsonResponse(201, { data: template }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
