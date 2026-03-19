import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { getOrgSubmission } from "../lib/submissions";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_SUBMISSION_READ");

    const submissionId = event.pathParameters?.submissionId;
    if (!submissionId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing submissionId path parameter.");
    }

    const data = await getOrgSubmission(auth.tenantId, submissionId);
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

