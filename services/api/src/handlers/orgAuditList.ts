import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { listAuditEvents } from "../lib/audit";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer.");
  }
  return parsed;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_AUDIT_READ");

    const q = event.queryStringParameters ?? {};
    const result = await listAuditEvents(auth.tenantId, {
      action: q.action,
      resourceType: q.resourceType,
      createdFrom: q.createdFrom,
      createdTo: q.createdTo,
      limit: parseLimit(q.limit),
      cursor: q.cursor
    });
    return jsonResponse(200, result, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

