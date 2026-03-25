import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { writeAuditEvent } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { getCourse } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { toOrgSubmissionView } from "../lib/orgViews";
import { parseJsonBody } from "../lib/request";
import { type SubmissionStatus, updateOrgSubmissionStatus } from "../lib/submissions";

type UpdateSubmissionStatusBody = {
  status: SubmissionStatus;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_SUBMISSION_WRITE");

    const submissionId = event.pathParameters?.submissionId;
    if (!submissionId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing submissionId path parameter.");
    }

    const body = parseJsonBody<UpdateSubmissionStatusBody>(event);
    const data = await updateOrgSubmissionStatus(auth.tenantId, submissionId, auth.userId, {
      status: body.status
    });
    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "submission.status_update",
      resourceType: "submission",
      resourceId: submissionId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { status: data.status }
    });

    let courseTitle: string | null = null;
    try {
      courseTitle = (await getCourse(auth.tenantId, data.courseId)).title;
    } catch {
      courseTitle = null;
    }

    return jsonResponse(200, { data: toOrgSubmissionView(data, { courseTitle }) }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

