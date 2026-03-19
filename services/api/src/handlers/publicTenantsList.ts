import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { listPublicTenantDirectory } from "../lib/tenants";

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
    const limit = parseLimit(event.queryStringParameters?.limit);
    const data = await listPublicTenantDirectory(limit ?? 50);
    return jsonResponse(
      200,
      {
        data,
        page: {
          limit: limit ?? 50,
          nextCursor: null
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
