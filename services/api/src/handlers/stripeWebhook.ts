import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { errorResponse, jsonResponse } from "../lib/http";
import {
  getPaymentByIntentId,
  updatePaymentRecord,
  verifyStripeWebhookSignature
} from "../lib/payments";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const signature = event.headers?.["stripe-signature"] ?? event.headers?.["Stripe-Signature"];
    if (!signature) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing Stripe-Signature header." }) };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
      : (event.body ?? "");

    const stripeEvent = verifyStripeWebhookSignature(rawBody, signature);

    // Only handle PaymentIntent events we care about.
    if (
      stripeEvent.type === "payment_intent.succeeded" ||
      stripeEvent.type === "payment_intent.payment_failed"
    ) {
      const pi = stripeEvent.data.object as { id: string; latest_charge?: string | null };
      const payment = await getPaymentByIntentId(pi.id);
      if (payment && payment.status === "pending") {
        await updatePaymentRecord(payment.tenantId, payment.id, {
          status: stripeEvent.type === "payment_intent.succeeded" ? "succeeded" : "failed",
          ...(stripeEvent.type === "payment_intent.succeeded" && typeof pi.latest_charge === "string"
            ? { stripeChargeId: pi.latest_charge }
            : {})
        });
      }
    }

    // Stripe expects a 2xx response quickly — any non-2xx triggers a retry.
    return jsonResponse(200, { received: true }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
