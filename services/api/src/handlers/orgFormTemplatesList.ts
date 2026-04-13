import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { listFormTemplates } from "../lib/formTemplates";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_READ");

    const templates = await listFormTemplates(auth.tenantId);

    return jsonResponse(200, { data: templates }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
