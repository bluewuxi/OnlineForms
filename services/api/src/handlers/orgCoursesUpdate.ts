import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { type UpdateCourseInput, updateCourse } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { toOrgCourseView } from "../lib/orgViews";
import { parseJsonBody } from "../lib/request";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_COURSE_WRITE");

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const input = parseJsonBody<UpdateCourseInput>(event);
    const course = await updateCourse(auth.tenantId, courseId, auth.userId, input);
    return jsonResponse(200, { data: toOrgCourseView(course) }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};


