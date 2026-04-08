import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { removeInternalUserRole, type InternalRole } from "../lib/internalAccessUsers";
import { writeInternalUserActivity } from "../lib/internalUserActivity";
import { parseJsonBody } from "../lib/request";

type RoleMutationBody = {
  role?: unknown;
};

function parseRole(input: unknown): InternalRole {
  if (input === "internal_admin" || input === "platform_support") {
    return input;
  }
  throw new ApiError(400, "VALIDATION_ERROR", "role is invalid.", [{ field: "role", issue: "invalid_role" }]);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const userId = event.pathParameters?.userId?.trim();
    if (!userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing userId path parameter.");
    }
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true,
    });
    authorizeOrgAction(auth, "INTERNAL_USER_WRITE");

    const body = parseJsonBody<RoleMutationBody>(event);
    const role = parseRole(body.role);
    const data = await removeInternalUserRole(userId, role, auth.userId);
    await writeInternalUserActivity({
      userId: data.userId,
      actorUserId: auth.userId,
      eventType: "internal_user.role_removed",
      summary: `Role ${role} was removed from ${data.email ?? data.username}.`,
      details: { role },
    });
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
