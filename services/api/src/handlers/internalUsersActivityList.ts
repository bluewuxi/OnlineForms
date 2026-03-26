import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { listInternalUserActivity } from "../lib/internalUserActivity";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 100.");
  }
  return parsed;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const userId = event.pathParameters?.userId?.trim();
    if (!userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing userId path parameter.");
    }
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true,
    });
    authorizeOrgAction(auth, "INTERNAL_USER_READ");

    const limit = parseLimit(event.queryStringParameters?.limit) ?? 20;
    const cursor = event.queryStringParameters?.cursor;
    const result = await listInternalUserActivity(userId, limit, cursor);
    return jsonResponse(200, result, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
