import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { jsonResponse } from "../lib/http";

const serviceName = process.env.SERVICE_NAME ?? "onlineforms-api";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const requestId = event.requestContext.requestId;
  const correlation = createCorrelationContext(requestId, event.headers);

  return jsonResponse(
    200,
    {
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
      requestId: correlation.requestId,
      correlationId: correlation.correlationId
    },
    correlation
  );
};
