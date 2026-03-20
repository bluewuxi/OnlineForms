import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { getPublicTenantHomeByCode } from "../lib/tenants";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantCode = event.pathParameters?.tenantCode;
    if (!tenantCode) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantCode path parameter.");
    }

    const data = await getPublicTenantHomeByCode(tenantCode);
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
