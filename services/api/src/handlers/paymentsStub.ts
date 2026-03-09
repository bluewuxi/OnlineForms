import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    throw new ApiError(409, "CONFLICT", "Payments are not enabled in MVP.", [
      {
        field: "feature",
        issue: "payments_disabled"
      },
      {
        field: "path",
        issue: event.rawPath
      }
    ]);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
