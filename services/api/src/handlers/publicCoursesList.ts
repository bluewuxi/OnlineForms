import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { listPublicCourses } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantCode = event.pathParameters?.tenantCode;
    if (!tenantCode) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantCode path parameter.");
    }

    const q = event.queryStringParameters?.q;
    const courses = await listPublicCourses(tenantCode, q);
    return jsonResponse(200, { data: courses, page: { limit: courses.length, nextCursor: null } }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
