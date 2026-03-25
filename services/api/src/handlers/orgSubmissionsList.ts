import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { listCourses } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { toOrgSubmissionView } from "../lib/orgViews";
import { listOrgSubmissions, type SubmissionStatus } from "../lib/submissions";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer.");
  }
  return parsed;
}

function parseStatus(value: string | undefined): SubmissionStatus | undefined {
  if (!value) return undefined;
  if (value !== "submitted" && value !== "reviewed" && value !== "canceled") {
    throw new ApiError(400, "VALIDATION_ERROR", "status must be one of submitted, reviewed, canceled.");
  }
  return value;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_SUBMISSION_READ");

    const query = event.queryStringParameters ?? {};
    const result = await listOrgSubmissions(auth.tenantId, {
      courseId: query.courseId,
      status: parseStatus(query.status),
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
      limit: parseLimit(query.limit),
      cursor: query.cursor
    });
    const courses = await listCourses(auth.tenantId);
    const courseTitles = new Map(courses.map((course) => [course.id, course.title] as const));
    const data = result.data.map((submission) =>
      toOrgSubmissionView(submission, {
        courseTitle: courseTitles.get(submission.courseId) ?? null
      })
    );

    return jsonResponse(200, { ...result, data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

