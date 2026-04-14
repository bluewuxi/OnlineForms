import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { createVariant, type CreateVariantInput } from "../lib/courses";
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

    const input = parseJsonBody<CreateVariantInput>(event);
    const variant = await createVariant(auth.tenantId, courseId, auth.userId, input);

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "course.variant.create",
      resourceType: "course_variant",
      resourceId: variant.id,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { courseId, variantId: variant.id, title: variant.title }
    });

    return jsonResponse(201, { data: variant }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
