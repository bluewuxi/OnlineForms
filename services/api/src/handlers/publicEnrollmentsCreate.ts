import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { emitPublicEnrollmentCreateMetric, logFrontendAudit } from "../lib/frontendObservability";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { createPublicEnrollment, type CreateEnrollmentInput } from "../lib/submissions";

function getRequiredHeader(headers: Record<string, string | undefined>, name: string): string {
  const direct = headers[name];
  if (direct && direct.trim()) return direct.trim();

  const lower = headers[name.toLowerCase()];
  if (lower && lower.trim()) return lower.trim();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase() && value && value.trim()) {
      return value.trim();
    }
  }
  throw new ApiError(400, "VALIDATION_ERROR", `${name} header is required.`);
}

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

    const idempotencyKey = getRequiredHeader(event.headers, "Idempotency-Key");
    const body = parseJsonBody<CreateEnrollmentInput>(event);
    const data = await createPublicEnrollment(tenantCode, courseId, idempotencyKey, body);
    emitPublicEnrollmentCreateMetric();
    logFrontendAudit("frontend_public_enrollment_created", {
      tenantCode,
      courseId,
      submissionId: data.submissionId
    });

    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
