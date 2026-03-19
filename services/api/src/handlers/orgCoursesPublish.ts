import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { writeAuditEvent } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { setCourseStatus } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_COURSE_WRITE");

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const course = await setCourseStatus(auth.tenantId, courseId, auth.userId, "publish");
    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "course.publish",
      resourceType: "course",
      resourceId: courseId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { status: course.status, publicVisible: course.publicVisible }
    });
    return jsonResponse(
      200,
      { data: { id: course.id, status: course.status, publicVisible: course.publicVisible } },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

