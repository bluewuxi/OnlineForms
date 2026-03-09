import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { assertAssetBindable } from "./assets";
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

export type PublicCourse = {
  id: string;
  title: string;
  shortDescription: string;
  imageUrl: string | null;
  startDate: string;
  endDate: string;
  deliveryMode: DeliveryMode;
  pricingMode: PricingMode;
};

export type PublicCourseDetail = PublicCourse & {
  fullDescription: string;
  enrollmentOpenAt: string;
  enrollmentCloseAt: string;
  enrollmentOpenNow: boolean;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function courseSk(courseId: string): string {
  return `COURSE#${courseId}`;
}

function coursePublicSk(courseId: string): string {
  return `COURSE_PUBLIC#${courseId}`;
}

function tenantCodePk(tenantCode: string): string {
  return `TENANTCODE#${tenantCode}`;
}

function imageUrlFromAssetId(imageAssetId: string | null): string | null {
  if (!imageAssetId) return null;
  return `https://cdn.onlineforms.com/assets/${imageAssetId}`;
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

function publicCourseFromItem(item: Record<string, unknown>): PublicCourse {
  return {
    id: item.courseId as string,
    title: item.title as string,
    shortDescription: item.shortDescription as string,
    imageUrl: (item.imageUrl as string | null) ?? null,
    startDate: item.startDate as string,
    endDate: item.endDate as string,
    deliveryMode: item.deliveryMode as DeliveryMode,
    pricingMode: item.pricingMode as PricingMode
  };
}

function publicCourseDetailFromItem(item: Record<string, unknown>): PublicCourseDetail {
  const nowMs = Date.now();
  const openAtMs = Date.parse(String(item.enrollmentOpenAt ?? ""));
  const closeAtMs = Date.parse(String(item.enrollmentCloseAt ?? ""));
  const enrollmentOpenNow =
    Number.isFinite(openAtMs) && Number.isFinite(closeAtMs) && openAtMs <= nowMs && nowMs <= closeAtMs;

  return {
    ...publicCourseFromItem(item),
    fullDescription: item.fullDescription as string,
    enrollmentOpenAt: item.enrollmentOpenAt as string,
    enrollmentCloseAt: item.enrollmentCloseAt as string,
    enrollmentOpenNow
  };
}

async function upsertPublicProjection(course: Course): Promise<void> {
  if (course.status !== "published" || !course.publicVisible) return;
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: tenantPk(course.tenantId),
        SK: coursePublicSk(course.id),
        entityType: "COURSE_PUBLIC",
        tenantId: course.tenantId,
        courseId: course.id,
        title: course.title,
        shortDescription: course.shortDescription,
        fullDescription: course.fullDescription,
        imageUrl: imageUrlFromAssetId(course.imageAssetId),
        startDate: course.startDate,
        endDate: course.endDate,
        enrollmentOpenAt: course.enrollmentOpenAt,
        enrollmentCloseAt: course.enrollmentCloseAt,
        deliveryMode: course.deliveryMode,
        pricingMode: course.pricingMode,
        status: course.status,
        publicVisible: course.publicVisible,
        updatedAt: course.updatedAt
      }
    })
  );
}

async function deletePublicProjection(tenantId: string, courseId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: coursePublicSk(courseId) }
    })
  );
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
  if (input.imageAssetId) {
    await assertAssetBindable(tenantId, input.imageAssetId, "course_image");
  }
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
  if (input.imageAssetId) {
    await assertAssetBindable(tenantId, input.imageAssetId, "course_image");
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
  const course = courseFromItem(out.Attributes as Record<string, unknown>);
  if (course.status === "published" && course.publicVisible) {
    await upsertPublicProjection(course);
  } else {
    await deletePublicProjection(tenantId, courseId);
  }
  return course;
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
  const course = courseFromItem(out.Attributes as Record<string, unknown>);
  if (action === "publish") {
    await upsertPublicProjection(course);
  } else {
    await deletePublicProjection(tenantId, courseId);
  }
  return course;
}

export async function resolveTenantIdByCode(tenantCode: string): Promise<string> {
  const normalizedCode = tenantCode.trim().toLowerCase();
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantCodePk(normalizedCode), SK: "MAP" }
    })
  );

  const item = out.Item as Record<string, unknown> | undefined;
  if (!item || item.status === "suspended") {
    throw new ApiError(404, "NOT_FOUND", "Tenant not found.");
  }

  const tenantId = item.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "Tenant not found.");
  }

  return tenantId;
}

export async function listPublicCourses(tenantCode: string, q?: string): Promise<PublicCourse[]> {
  const tenantId = await resolveTenantIdByCode(tenantCode);
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":sk": "COURSE_PUBLIC#"
      }
    })
  );

  const keyword = q?.trim().toLowerCase();
  const rows = (out.Items ?? []).map((i) => i as Record<string, unknown>);
  const filtered = keyword
    ? rows.filter((item) => {
        const haystack = `${String(item.title ?? "")} ${String(item.shortDescription ?? "")} ${String(
          item.fullDescription ?? ""
        )}`.toLowerCase();
        return haystack.includes(keyword);
      })
    : rows;

  return filtered
    .map(publicCourseFromItem)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

export async function getPublicCourseDetail(
  tenantCode: string,
  courseId: string
): Promise<PublicCourseDetail> {
  const tenantId = await resolveTenantIdByCode(tenantCode);
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: coursePublicSk(courseId) }
    })
  );

  if (!out.Item) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  return publicCourseDetailFromItem(out.Item as Record<string, unknown>);
}
