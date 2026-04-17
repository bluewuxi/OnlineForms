import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createCorrelationContext } from "../lib/correlation";
import { getPublicCourseDetail, resolveTenantIdByCode } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { createPaymentRecord, createStripePaymentIntent } from "../lib/payments";
import { parseJsonBody } from "../lib/request";
import { getTenantProfile } from "../lib/tenants";

type PaymentIntentCreateBody = {
  variantId: string;
  formVersion: number;
  answers: Record<string, unknown>;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const tenantCode = event.pathParameters?.tenantCode;
    if (!tenantCode) throw new ApiError(400, "VALIDATION_ERROR", "Missing tenantCode path parameter.");

    const courseId = event.pathParameters?.courseId;
    if (!courseId) throw new ApiError(400, "VALIDATION_ERROR", "Missing courseId path parameter.");

    const body = parseJsonBody<PaymentIntentCreateBody>(event);

    if (!body.variantId || typeof body.variantId !== "string") {
      throw new ApiError(400, "VALIDATION_ERROR", "variantId is required.");
    }

    // Resolve tenant and fetch course to get the variant price.
    const tenantId = await resolveTenantIdByCode(tenantCode);
    const publicCourse = await getPublicCourseDetail(tenantCode, courseId);

    if (!publicCourse.enrollmentOpenNow) {
      throw new ApiError(409, "CONFLICT", "Enrollment window is closed.");
    }

    const variant = (publicCourse.variants ?? []).find((v) => v.id === body.variantId);
    if (!variant) {
      throw new ApiError(400, "VALIDATION_ERROR", "variantId is not valid for this course.");
    }

    const amount = variant.price;
    if (typeof amount !== "number" || amount <= 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "This variant does not have a price. Use the free enrollment flow.");
    }

    // Fetch tenant payment configuration.
    const tenantProfile = await getTenantProfile(tenantId);
    if (!tenantProfile.currency || !tenantProfile.stripeAccountId) {
      throw new ApiError(503, "PAYMENT_NOT_CONFIGURED", "Payment is not configured for this organisation.");
    }

    const applicationFeeAmount = Math.round(amount * (tenantProfile.applicationFeePercent ?? 0) / 100);

    // Create Stripe PaymentIntent (destination charge to connected account).
    const { id: stripePaymentIntentId, clientSecret } = await createStripePaymentIntent(
      amount,
      tenantProfile.currency,
      {
        tenantId,
        tenantCode,
        courseId,
        variantId: body.variantId
      },
      tenantProfile.stripeAccountId,
      applicationFeeAmount
    );

    // Write pending payment record.
    const payment = await createPaymentRecord({
      tenantId,
      courseId,
      variantId: body.variantId,
      amount,
      currency: tenantProfile.currency,
      stripePaymentIntentId,
      stripeAccountId: tenantProfile.stripeAccountId,
      applicationFeeAmount
    });

    return jsonResponse(201, {
      data: {
        clientSecret,
        paymentIntentId: stripePaymentIntentId,
        paymentId: payment.id,
        amount,
        currency: tenantProfile.currency
      }
    }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};
