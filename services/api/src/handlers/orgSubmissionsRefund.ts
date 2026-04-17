import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { writeAuditEvent } from "../lib/audit";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import {
  createStripeRefund,
  getPaymentBySubmissionId,
  updatePaymentRecord
} from "../lib/payments";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_COURSE_WRITE");

    const submissionId = event.pathParameters?.submissionId;
    if (!submissionId) throw new ApiError(400, "VALIDATION_ERROR", "Missing submissionId path parameter.");

    const payment = await getPaymentBySubmissionId(submissionId);
    if (!payment) {
      throw new ApiError(404, "NOT_FOUND", "No payment record found for this submission.");
    }
    if (payment.tenantId !== auth.tenantId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied.");
    }
    if (payment.status !== "succeeded") {
      throw new ApiError(409, "CONFLICT", `Cannot refund a payment with status "${payment.status}".`);
    }

    const isConnectCharge = payment.stripeAccountId != null;
    const refund = await createStripeRefund(payment.stripePaymentIntentId, {
      reverseTransfer: isConnectCharge,
      refundApplicationFee: isConnectCharge && payment.applicationFeeAmount != null
    });

    await updatePaymentRecord(auth.tenantId, payment.id, {
      status: "refunded",
      refundedAmount: refund.amount
    });

    await writeAuditEvent({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "payment.refund",
      resourceType: "payment",
      resourceId: payment.id,
      correlationId: correlation.correlationId,
      requestId: correlation.requestId,
      details: { submissionId, refundId: refund.id, amount: refund.amount, currency: refund.currency }
    });

    return jsonResponse(200, {
      data: {
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: "refunded"
      }
    }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
