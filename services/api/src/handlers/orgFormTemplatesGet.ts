import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { getFormTemplate } from "../lib/formTemplates";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_FORM_READ");

    const templateId = event.pathParameters?.templateId;
    if (!templateId) throw new ApiError(400, "VALIDATION_ERROR", "Missing templateId path parameter.");

    const template = await getFormTemplate(auth.tenantId, templateId);

    return jsonResponse(200, { data: template }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
