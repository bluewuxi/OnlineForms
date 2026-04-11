import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { acceptTenantInvite, getCallerEmailFromCognito } from "../lib/authInvites";
import { errorResponse, jsonResponse } from "../lib/http";

const serviceName = process.env.SERVICE_NAME ?? "onlineforms-api";

function log(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    type: "invite_accept",
    event,
    service: serviceName,
    timestamp: new Date().toISOString(),
    ...details
  }));
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantId = event.pathParameters?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantId path parameter.");
    }
    const inviteId = event.pathParameters?.inviteId?.trim();
    if (!inviteId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing inviteId path parameter.");
    }

    log("accept_started", {
      tenantId,
      inviteId,
      authMode: process.env.AUTH_MODE ?? "(unset)",
      correlationId: correlation.correlationId
    });

    const auth = await authenticateRequest(event.headers, {
      tenantIdHint: tenantId,
      requireMembership: false
    });

    log("auth_resolved", {
      tenantId,
      inviteId,
      userId: auth.userId,
      emailPresentInToken: auth.email !== null,
      emailVerifiedInToken: auth.emailVerified,
      correlationId: correlation.correlationId
    });

    // Access tokens do not carry an email claim. In Cognito mode, fall back to
    // AdminGetUser (by sub) to resolve the caller's email. In mock mode the
    // email comes from request headers; if it is absent we let the check below
    // surface a 403 without touching Cognito at all.
    let callerEmail = auth.email;
    let callerEmailVerified = auth.emailVerified;
    if (!callerEmail && process.env.AUTH_MODE === "cognito") {
      log("cognito_lookup_started", {
        tenantId,
        inviteId,
        userId: auth.userId,
        correlationId: correlation.correlationId
      });
      const cognitoAttrs = await getCallerEmailFromCognito(auth.userId);
      callerEmail = cognitoAttrs.email;
      callerEmailVerified = cognitoAttrs.emailVerified;
      log("cognito_lookup_resolved", {
        tenantId,
        inviteId,
        userId: auth.userId,
        emailResolved: callerEmail !== null,
        emailVerified: callerEmailVerified,
        correlationId: correlation.correlationId
      });
    }

    if (!callerEmail || !callerEmailVerified) {
      log("accept_rejected_no_email", {
        tenantId,
        inviteId,
        userId: auth.userId,
        callerEmailNull: callerEmail === null,
        callerEmailVerified,
        correlationId: correlation.correlationId
      });
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Invite acceptance requires a verified authenticated email address."
      );
    }

    log("accept_email_check_passed", {
      tenantId,
      inviteId,
      userId: auth.userId,
      callerEmail,
      callerEmailVerified,
      correlationId: correlation.correlationId
    });

    const data = await acceptTenantInvite(tenantId, inviteId, auth.userId, callerEmail);

    log("accept_succeeded", {
      tenantId,
      inviteId,
      userId: auth.userId,
      role: data.role,
      correlationId: correlation.correlationId
    });

    return jsonResponse(200, { data }, correlation);
  } catch (error) {
    log("accept_error", {
      tenantId: event.pathParameters?.tenantId ?? null,
      inviteId: event.pathParameters?.inviteId ?? null,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCode: error instanceof ApiError ? error.code : undefined,
      statusCode: error instanceof ApiError ? error.statusCode : undefined,
      correlationId: correlation.correlationId
    });
    return errorResponse(error, correlation);
  }
};
