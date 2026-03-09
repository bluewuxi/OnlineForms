import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ApiError } from "./errors";

export function parseJsonBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body is required.");
  }
  try {
    return JSON.parse(event.body) as T;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}

