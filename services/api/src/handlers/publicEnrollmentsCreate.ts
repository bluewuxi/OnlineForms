import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { verifyCaptcha } from "../lib/captcha";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { emitHoneypotHitMetric, emitPublicEnrollmentCreateMetric, logFrontendAudit } from "../lib/frontendObservability";
import { errorResponse, jsonResponse } from "../lib/http";
import { checkRateLimit } from "../lib/rateLimit";
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

    // Derive client IP from X-Forwarded-For (API Gateway populates this)
    const xForwardedFor = event.headers?.["x-forwarded-for"] ?? event.headers?.["X-Forwarded-For"] ?? "";
    const clientIp = xForwardedFor.split(",")[0].trim() || "unknown";

    const idempotencyKey = getRequiredHeader(event.headers, "Idempotency-Key");
    const body = parseJsonBody<CreateEnrollmentInput & { _captchaToken?: string; _hp?: boolean }>(event);

    // BS-02: CAPTCHA verification runs first — fail fast on obvious bots
    await verifyCaptcha(body._captchaToken, clientIp);

    // BS-03: Honeypot — silently discard bot submissions
    if (body._hp === true) {
      console.log(
        JSON.stringify({
          type: "honeypot_hit",
          ip: clientIp,
          tenantCode,
          courseId,
          timestamp: new Date().toISOString()
        })
      );
      emitHoneypotHitMetric();
      return jsonResponse(201, { data: { status: "submitted" } }, correlation);
    }

    // Strip control fields before any further processing or storage
    const { _captchaToken: _c, _hp: _h, ...cleanBody } = body;

    // BS-01: Rate limiting: max 10 submissions per IP per hour (skipped in mock mode)
    await checkRateLimit(clientIp);
    const data = await createPublicEnrollment(tenantCode, courseId, idempotencyKey, cleanBody);
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
