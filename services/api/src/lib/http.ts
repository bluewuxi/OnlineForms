import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { CorrelationContext } from "./correlation";

export function jsonResponse(
  statusCode: number,
  body: unknown,
  correlation: CorrelationContext
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-correlation-id": correlation.correlationId
    },
    body: JSON.stringify(body)
  };
}
