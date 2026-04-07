import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { CorrelationContext } from "./correlation";
import { ApiError } from "./errors";

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

export function errorResponse(
  error: unknown,
  correlation: CorrelationContext
): APIGatewayProxyStructuredResultV2 {
  if (error instanceof ApiError) {
    const errorBody: Record<string, unknown> = {
      code: error.code,
      message: error.message,
      details: error.details ?? []
    };
    if (error.retryAfter !== undefined) {
      errorBody["retryAfter"] = error.retryAfter;
    }
    if (error.fields !== undefined) {
      errorBody["fields"] = error.fields;
    }
    return jsonResponse(
      error.statusCode,
      {
        error: errorBody,
        requestId: correlation.requestId,
        correlationId: correlation.correlationId
      },
      correlation
    );
  }

  return jsonResponse(
    500,
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
        details: []
      },
      requestId: correlation.requestId,
      correlationId: correlation.correlationId
    },
    correlation
  );
}
