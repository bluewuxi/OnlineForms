import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { updateTenantMemberRole } from "../lib/authMembers";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

type UpdateMemberBody = {
  role: "org_admin" | "org_editor" | "org_viewer";
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }
    const userId = event.pathParameters?.userId?.trim();
    if (!userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing userId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, { tenantIdHint: tenantId });
    authorizeOrgAction(auth, "ORG_MEMBER_WRITE", tenantId);

    const body = parseJsonBody<UpdateMemberBody>(event);
    const member = await updateTenantMemberRole(tenantId, userId, body.role, auth.userId);
    return jsonResponse(200, { data: member }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
