import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { AUTH_ROLE_OPTIONS } from "../lib/authOptions";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    return jsonResponse(
      200,
      {
        data: {
          roles: AUTH_ROLE_OPTIONS
        }
      },
      correlation
    );
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
