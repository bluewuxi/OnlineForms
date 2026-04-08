import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { createTenantInvite } from "../lib/authInvites";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

type CreateInviteBody = {
  email: string;
  role: "org_admin" | "org_editor" | "org_viewer";
  expiresInDays?: number;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }

    const auth = await authenticateRequest(event.headers, { tenantIdHint: tenantId });
    authorizeOrgAction(auth, "ORG_TENANT_INVITE_CREATE", tenantId);

    const body = parseJsonBody<CreateInviteBody>(event);
    const data = await createTenantInvite(tenantId, auth.userId, body);
    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
