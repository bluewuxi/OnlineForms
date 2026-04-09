import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { listTenantInvites } from "../lib/authMembers";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, { tenantIdHint: tenantId });
    authorizeOrgAction(auth, "ORG_MEMBER_READ", tenantId);

    const rawStatus = event.queryStringParameters?.status?.trim();
    if (rawStatus && rawStatus !== "pending" && rawStatus !== "accepted") {
      throw new ApiError(400, "VALIDATION_ERROR", "status must be pending or accepted.");
    }
    const statusFilter = rawStatus as "pending" | "accepted" | undefined;

    const invites = await listTenantInvites(tenantId, statusFilter);
    return jsonResponse(200, { data: invites }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
