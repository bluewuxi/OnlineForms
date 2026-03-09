import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, requireAnyRole } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { type SubmissionStatus, updateOrgSubmissionStatus } from "../lib/submissions";

type UpdateSubmissionStatusBody = {
  status: SubmissionStatus;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    requireAnyRole(auth, ["org_admin", "org_editor", "platform_admin"]);

    const submissionId = event.pathParameters?.submissionId;
    if (!submissionId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing submissionId path parameter.");
    }

    const body = parseJsonBody<UpdateSubmissionStatusBody>(event);
    const data = await updateOrgSubmissionStatus(auth.tenantId, submissionId, auth.userId, {
      status: body.status
    });

    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
