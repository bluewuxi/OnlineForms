import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { listInternalTenantProfiles } from "../lib/tenants";

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

    const limit = parseLimit(event.queryStringParameters?.limit) ?? 100;
    const data = await listInternalTenantProfiles(limit);
    return jsonResponse(
      200,
      {
        data,
        page: {
          limit,
          nextCursor: null
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
