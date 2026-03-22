import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { listInternalAccessUsers } from "../lib/internalAccessUsers";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 200.");
  }
  return parsed;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    authorizeOrgAction(auth, "INTERNAL_TENANT_READ");

    const limit = parseLimit(event.queryStringParameters?.limit) ?? 50;
    const cursor = event.queryStringParameters?.cursor;
    const result = await listInternalAccessUsers(limit, cursor);

    return jsonResponse(
      200,
      result,
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
