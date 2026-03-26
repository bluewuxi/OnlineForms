import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { writeInternalUserActivity } from "../lib/internalUserActivity";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true,
    });
    authorizeOrgAction(auth, "INTERNAL_USER_READ");

    await writeInternalUserActivity({
      userId: auth.userId,
      actorUserId: auth.userId,
      eventType: "internal_user.logout",
      summary: "Internal user logged out of the management console.",
    });

    return jsonResponse(200, { data: { loggedOut: true } }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
