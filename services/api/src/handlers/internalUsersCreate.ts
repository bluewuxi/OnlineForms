import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { emitInternalAccessGrantMetric, logAuthAudit } from "../lib/authObservability";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { addInternalAccessUserByEmail } from "../lib/internalAccessUsers";
import { parseJsonBody } from "../lib/request";

type CreateInternalUserBody = {
  email?: unknown;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers, {
      requireMembership: false,
      allowMissingTenantContext: true
    });
    authorizeOrgAction(auth, "INTERNAL_USER_WRITE");

    const body = parseJsonBody<CreateInternalUserBody>(event);
    const email = typeof body.email === "string" ? body.email : "";
    if (!email.trim()) {
      throw new ApiError(400, "VALIDATION_ERROR", "email is required.");
    }

    const data = await addInternalAccessUserByEmail(email);
    emitInternalAccessGrantMetric();
    logAuthAudit("auth_internal_access_granted", {
      actorUserId: auth.userId,
      targetUserId: data.userId,
      targetEmail: data.email
    });
    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    if (error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 409)) {
      logAuthAudit("auth_internal_access_mutation_failed", {
        action: "grant",
        reason: error.message,
        code: error.code
      });
    }
    return errorResponse(error, correlation);
  }
};
