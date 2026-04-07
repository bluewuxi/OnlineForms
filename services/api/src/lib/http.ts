import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { CorrelationContext } from "./correlation";
import { ApiError } from "./errors";

/** True when running in a local/test environment where debug info may be exposed. */
function isLocalEnv(): boolean {
  const env = process.env.APP_ENV ?? process.env.DEPLOYMENT_ENVIRONMENT ?? "";
  return env === "local" || env === "test";
}

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
    // Log 5xx ApiErrors to CloudWatch with full context; 4xx are expected and not alarming
    if (error.statusCode >= 500) {
      console.error(
        JSON.stringify({
          type: "api_error",
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          correlationId: correlation.correlationId,
          requestId: correlation.requestId,
          stack: error.stack
        })
      );
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

  // Unknown / unhandled error — log full details to CloudWatch, return generic 500
  const isLocal = isLocalEnv();
  const errMessage = error instanceof Error ? error.message : String(error);
  const errStack = error instanceof Error ? error.stack : undefined;

  console.error(
    JSON.stringify({
      type: "unhandled_error",
      message: errMessage,
      stack: errStack,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId
    })
  );

  const responseErrorBody: Record<string, unknown> = {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    details: []
  };

  // In local/test environments, include debug info to aid development
  if (isLocal && errMessage) {
    responseErrorBody["debug"] = errMessage;
  }

  return jsonResponse(
    500,
    {
      error: responseErrorBody,
      requestId: correlation.requestId,
      correlationId: correlation.correlationId
    },
    correlation
  );
}
