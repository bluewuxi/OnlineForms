import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, requireAnyRole } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
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
    requireAnyRole(auth, ["org_admin", "org_editor", "platform_admin"]);

    const query = event.queryStringParameters ?? {};
    const result = await listOrgSubmissions(auth.tenantId, {
      courseId: query.courseId,
      status: parseStatus(query.status),
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
      limit: parseLimit(query.limit),
      cursor: query.cursor
    });

    return jsonResponse(200, result, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
