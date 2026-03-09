import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest, requireAnyRole } from "../lib/auth";
import { createUploadTicket, type CreateUploadTicketInput } from "../lib/assets";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    requireAnyRole(auth, ["org_admin", "org_editor", "platform_admin"]);

    const body = parseJsonBody<CreateUploadTicketInput>(event);
    const data = await createUploadTicket(auth.tenantId, body);
    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
