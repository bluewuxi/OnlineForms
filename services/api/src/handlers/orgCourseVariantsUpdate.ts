import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { updateVariant, type UpdateVariantInput } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_COURSE_WRITE");

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const variantId = event.pathParameters?.variantId;
    if (!variantId) throw new ApiError(400, "VALIDATION_ERROR", "Missing variantId path parameter.");

    const input = parseJsonBody<UpdateVariantInput>(event);
    const variant = await updateVariant(auth.tenantId, courseId, variantId, auth.userId, input);

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "course.variant.update",
      resourceType: "course_variant",
      resourceId: variantId,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { courseId, variantId }
    });

    return jsonResponse(200, { data: variant }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
