import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { getCourseFormSchemaVersion } from "../lib/formSchemas";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { toOrgFormSchemaView } from "../lib/orgViews";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_READ");

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const rawVersion = event.pathParameters?.version;
    const version = Number(rawVersion);
    if (!rawVersion || Number.isNaN(version)) {
      throw new ApiError(400, "VALIDATION_ERROR", "version path parameter must be a number.");
    }

    const data = await getCourseFormSchemaVersion(auth.tenantId, courseId, version);
    return jsonResponse(200, { data: toOrgFormSchemaView(data) }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};


