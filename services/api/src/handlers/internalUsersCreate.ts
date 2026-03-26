import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { createInternalUser, type InternalRole } from "../lib/internalAccessUsers";
import { writeInternalUserActivity } from "../lib/internalUserActivity";
import { parseJsonBody } from "../lib/request";

type CreateInternalUserBody = {
  email?: unknown;
  preferredName?: unknown;
  password?: unknown;
  temporaryPassword?: unknown;
  internalRoles?: unknown;
  enabled?: unknown;
};

function parseRoles(input: unknown): InternalRole[] {
  if (!Array.isArray(input)) {
    return ["internal_admin"];
  }
  return input
    .filter((value): value is InternalRole => value === "internal_admin" || value === "platform_admin");
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true,
    });
    authorizeOrgAction(auth, "INTERNAL_USER_WRITE");

    const body = parseJsonBody<CreateInternalUserBody>(event);
    const created = await createInternalUser({
      email: typeof body.email === "string" ? body.email : "",
      preferredName: typeof body.preferredName === "string" ? body.preferredName : null,
      password: typeof body.password === "string" ? body.password : "",
      temporaryPassword: body.temporaryPassword === true,
      internalRoles: parseRoles(body.internalRoles),
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    });

    await writeInternalUserActivity({
      userId: created.userId,
      actorUserId: auth.userId,
      eventType: "internal_user.created",
      summary: `Internal user ${created.email ?? created.username} was created.`,
      details: {
        internalRoles: created.internalRoles,
        enabled: created.enabled,
      },
    });

    return jsonResponse(201, { data: created }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
