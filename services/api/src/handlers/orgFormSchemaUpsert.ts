import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, requireAnyRole } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { upsertCourseFormSchema, type FormField } from "../lib/formSchemas";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

type UpsertSchemaBody = {
  fields: FormField[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    requireAnyRole(auth, ["org_admin", "org_editor"]);

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const body = parseJsonBody<UpsertSchemaBody>(event);
    const data = await upsertCourseFormSchema(auth.tenantId, courseId, auth.userId, body.fields);

    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

