import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { resetInternalUserPassword } from "../lib/internalAccessUsers";
import { writeInternalUserActivity } from "../lib/internalUserActivity";
import { parseJsonBody } from "../lib/request";

type PasswordResetBody = {
  password?: unknown;
};

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

    const body = parseJsonBody<PasswordResetBody>(event);
    const password = typeof body.password === "string" ? body.password : "";
    const data = await resetInternalUserPassword(userId, password, auth.userId);
    await writeInternalUserActivity({
      userId: data.userId,
      actorUserId: auth.userId,
      eventType: "internal_user.password_reset",
      summary: "Temporary password reset was initiated.",
    });
    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
