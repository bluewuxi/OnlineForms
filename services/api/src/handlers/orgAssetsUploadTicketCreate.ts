import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createUploadTicket, type CreateUploadTicketInput } from "../lib/assets";
import { createCorrelationContext } from "../lib/correlation";
import { emitAssetUploadTicketCreateMetric, logFrontendAudit } from "../lib/frontendObservability";
import { errorResponse, jsonResponse } from "../lib/http";
import { parseJsonBody } from "../lib/request";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_ASSET_WRITE");

    const body = parseJsonBody<CreateUploadTicketInput>(event);
    const data = await createUploadTicket(auth.tenantId, body);
    emitAssetUploadTicketCreateMetric();
    logFrontendAudit("frontend_asset_upload_ticket_created", {
      tenantId: auth.tenantId,
      userId: auth.userId,
      assetId: data.assetId,
      purpose: body.purpose
    });
    return jsonResponse(201, { data }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};

