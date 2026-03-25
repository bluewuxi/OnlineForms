import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateRequest } from "../lib/auth";
import { authorizeOrgAction } from "../lib/authorization";
import { createCorrelationContext } from "../lib/correlation";
import { type CourseStatus, type DeliveryMode, listCourses, type PricingMode } from "../lib/courses";
import { ApiError } from "../lib/errors";
import { errorResponse, jsonResponse } from "../lib/http";
import { toOrgCourseView } from "../lib/orgViews";

function parseStatus(value: string | undefined): CourseStatus | undefined {
  if (!value) return undefined;
  if (value !== "draft" && value !== "published" && value !== "archived") {
    throw new ApiError(400, "VALIDATION_ERROR", "status must be one of draft, published, archived.");
  }
  return value;
}

function parsePricingMode(value: string | undefined): PricingMode | undefined {
  if (!value) return undefined;
  if (value !== "free" && value !== "paid_placeholder") {
    throw new ApiError(400, "VALIDATION_ERROR", "pricingMode must be one of free, paid_placeholder.");
  }
  return value;
}

function parseDeliveryMode(value: string | undefined): DeliveryMode | undefined {
  if (!value) return undefined;
  if (value !== "online" && value !== "onsite" && value !== "hybrid") {
    throw new ApiError(400, "VALIDATION_ERROR", "deliveryMode must be one of online, onsite, hybrid.");
  }
  return value;
}

function parseBoolean(value: string | undefined, field: string): boolean | undefined {
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ApiError(400, "VALIDATION_ERROR", `${field} must be true or false.`);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlation = createCorrelationContext(event.requestContext.requestId, event.headers);
  try {
    const auth = await authenticateRequest(event.headers);
    authorizeOrgAction(auth, "ORG_COURSE_READ");

    const query = event.queryStringParameters ?? {};
    const courses = await listCourses(auth.tenantId, {
      status: parseStatus(query.status),
      pricingMode: parsePricingMode(query.pricingMode),
      deliveryMode: parseDeliveryMode(query.deliveryMode),
      publicVisible: parseBoolean(query.publicVisible, "publicVisible"),
      q: query.q
    });
    const data = courses.map(toOrgCourseView);
    return jsonResponse(200, { data, page: { limit: data.length, nextCursor: null } }, correlation);
  } catch (error) {
    return errorResponse(error, correlation);
  }
};


