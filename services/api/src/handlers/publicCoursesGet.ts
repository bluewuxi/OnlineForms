import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { getPublicCourseDetail } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantCode = event.pathParameters?.tenantCode;
    if (!tenantCode) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantCode path parameter.");
    }

    const courseId = event.pathParameters?.courseId;
    if (!courseId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");
    }

    const course = await getPublicCourseDetail(tenantCode, courseId);
    return jsonResponse(200, { data: course }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
