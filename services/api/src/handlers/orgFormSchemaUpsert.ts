import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { writeAuditEvent } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { upsertCourseFormSchema, type FormField } from "../lib/formSchemas";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { summarizeFormFields } from "../lib/orgViews";
import { parseJsonBody } from "../lib/request";

type UpsertSchemaBody = {
  fields: FormField[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_WRITE");

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const body = parseJsonBody<UpsertSchemaBody>(event);
    const data = await upsertCourseFormSchema(auth.tenantId, courseId, auth.userId, body.fields);
    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "form.upsert",
      resourceType: "form",
      resourceId: `${courseId}:${data.formId}:${data.version}`,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { courseId, formId: data.formId, version: data.version, fieldCount: body.fields.length }
    });

    return jsonResponse(
      200,
      {
        data: {
          ...data,
          summary: summarizeFormFields(body.fields)
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

