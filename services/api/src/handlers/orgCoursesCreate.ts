import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { createCourse, type CreateCourseInput } from "../lib/courses";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_COURSE_WRITE");

    const input = parseJsonBody<CreateCourseInput>(event);
    const course = await createCourse(auth.tenantId, auth.userId, input);
    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "course.create",
      resourceType: "course",
      resourceId: course.id,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { title: course.title, status: course.status }
    });

    return jsonResponse(201, { data: { id: course.id, status: course.status } }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};


