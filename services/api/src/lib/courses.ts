import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";

export type CourseStatus = "draft" | "published" | "archived";
export type PricingMode = "free" | "paid_placeholder";
export type DeliveryMode = "online" | "onsite" | "hybrid";

export type Course = {
  id: string;
  tenantId: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  startDate: string;
  endDate: string;
  enrollmentOpenAt: string;
  enrollmentCloseAt: string;
  deliveryMode: DeliveryMode;
  locationText: string | null;
  capacity: number | null;
  status: CourseStatus;
  publicVisible: boolean;
  pricingMode: PricingMode;
  paymentEnabledFlag: boolean;
  imageAssetId: string | null;
  activeFormId: string | null;
  activeFormVersion: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type CreateCourseInput = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  startDate: string;
  endDate: string;
  enrollmentOpenAt: string;
  enrollmentCloseAt: string;
  deliveryMode: DeliveryMode;
  locationText: string | null;
  capacity: number | null;
  pricingMode: PricingMode;
  imageAssetId: string | null;
};

export type UpdateCourseInput = Partial<CreateCourseInput> & {
  publicVisible?: boolean;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function courseSk(courseId: string): string {
  return `COURSE#${courseId}`;
}

function courseFromItem(item: Record<string, unknown>): Course {
  return {
    id: item.courseId as string,
    tenantId: item.tenantId as string,
    title: item.title as string,
    shortDescription: item.shortDescription as string,
    fullDescription: item.fullDescription as string,
    startDate: item.startDate as string,
    endDate: item.endDate as string,
    enrollmentOpenAt: item.enrollmentOpenAt as string,
    enrollmentCloseAt: item.enrollmentCloseAt as string,
    deliveryMode: item.deliveryMode as DeliveryMode,
    locationText: (item.locationText as string | null) ?? null,
    capacity: (item.capacity as number | null) ?? null,
    status: item.status as CourseStatus,
    publicVisible: Boolean(item.publicVisible),
    pricingMode: item.pricingMode as PricingMode,
    paymentEnabledFlag: Boolean(item.paymentEnabledFlag),
    imageAssetId: (item.imageAssetId as string | null) ?? null,
    activeFormId: (item.activeFormId as string | null) ?? null,
    activeFormVersion: (item.activeFormVersion as number | null) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    createdBy: item.createdBy as string,
    updatedBy: item.updatedBy as string
  };
}

function validateCreate(input: CreateCourseInput): void {
  if (!input.title?.trim()) throw new ApiError(400, "VALIDATION_ERROR", "title is required.");
  if (!input.shortDescription?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "shortDescription is required.");
  }
  if (!input.fullDescription?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "fullDescription is required.");
  }
  if (!input.startDate) throw new ApiError(400, "VALIDATION_ERROR", "startDate is required.");
  if (!input.endDate) throw new ApiError(400, "VALIDATION_ERROR", "endDate is required.");
  if (!input.enrollmentOpenAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "enrollmentOpenAt is required.");
  }
  if (!input.enrollmentCloseAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "enrollmentCloseAt is required.");
  }
}

export async function createCourse(
  tenantId: string,
  userId: string,
  input: CreateCourseInput
): Promise<Course> {
  validateCreate(input);
  const now = new Date().toISOString();
  const id = `crs_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const item = {
    PK: tenantPk(tenantId),
    SK: courseSk(id),
    entityType: "COURSE",
    tenantId,
    courseId: id,
    title: input.title.trim(),
    shortDescription: input.shortDescription.trim(),
    fullDescription: input.fullDescription.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    enrollmentOpenAt: input.enrollmentOpenAt,
    enrollmentCloseAt: input.enrollmentCloseAt,
    deliveryMode: input.deliveryMode,
    locationText: input.locationText ?? null,
    capacity: input.capacity ?? null,
    status: "draft" as CourseStatus,
    publicVisible: false,
    pricingMode: input.pricingMode,
    paymentEnabledFlag: false,
    imageAssetId: input.imageAssetId ?? null,
    activeFormId: null,
    activeFormVersion: null,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    })
  );

  return courseFromItem(item);
}

export async function getCourse(tenantId: string, courseId: string): Promise<Course> {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) }
    })
  );

  if (!out.Item) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  return courseFromItem(out.Item as Record<string, unknown>);
}

export async function listCourses(tenantId: string): Promise<Course[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":sk": "COURSE#"
      }
    })
  );
  return (out.Items ?? []).map((i) => courseFromItem(i as Record<string, unknown>));
}

export async function updateCourse(
  tenantId: string,
  courseId: string,
  userId: string,
  input: UpdateCourseInput
): Promise<Course> {
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "No fields provided for update.");
  }

  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "No fields provided for update.");
  }

  const exprNames: Record<string, string> = { "#updatedAt": "updatedAt", "#updatedBy": "updatedBy" };
  const exprValues: Record<string, unknown> = {
    ":updatedAt": new Date().toISOString(),
    ":updatedBy": userId
  };
  const updates: string[] = ["#updatedAt = :updatedAt", "#updatedBy = :updatedBy"];

  for (const [key, value] of entries) {
    const nk = `#${key}`;
    const vk = `:${key}`;
    exprNames[nk] = key;
    exprValues[vk] = value;
    updates.push(`${nk} = ${vk}`);
  }

  const out = await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: "ALL_NEW"
    })
  );

  if (!out.Attributes) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  return courseFromItem(out.Attributes as Record<string, unknown>);
}

export async function setCourseStatus(
  tenantId: string,
  courseId: string,
  userId: string,
  action: "publish" | "archive"
): Promise<Course> {
  const current = await getCourse(tenantId, courseId);

  if (action === "publish") {
    if (current.status !== "draft") {
      throw new ApiError(409, "CONFLICT", "Only draft courses can be published.");
    }
    if (current.pricingMode !== "free") {
      throw new ApiError(409, "CONFLICT", "MVP only supports free course publishing.");
    }
  }

  const nextStatus: CourseStatus = action === "publish" ? "published" : "archived";
  const nextPublicVisible = action === "publish";

  const out = await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression:
        "SET #status = :status, #publicVisible = :publicVisible, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
      ExpressionAttributeNames: {
        "#status": "status",
        "#publicVisible": "publicVisible",
        "#updatedAt": "updatedAt",
        "#updatedBy": "updatedBy"
      },
      ExpressionAttributeValues: {
        ":status": nextStatus,
        ":publicVisible": nextPublicVisible,
        ":updatedAt": new Date().toISOString(),
        ":updatedBy": userId
      },
      ReturnValues: "ALL_NEW"
    })
  );

  if (!out.Attributes) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  return courseFromItem(out.Attributes as Record<string, unknown>);
}

